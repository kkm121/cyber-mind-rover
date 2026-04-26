#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <DHT.h>
#include <math.h>

// ==========================================
// HARDWARE PIN DEFINITIONS
// ==========================================
const int IN1 = 5;  // D1 (Forward Left)
const int IN2 = 4;  // D2 (Reverse Left)
const int IN3 = 2;  // D4 (Forward Right)
const int IN4 = 14; // D5 (Reverse Right)

#define DHTPIN 13     // D7 (GPIO 13)
#define DHTTYPE DHT11 
DHT dht(DHTPIN, DHTTYPE);
const int MQ_PIN = A0; 

// ==========================================
// NETWORK CONFIGURATION (USE MOBILE HOTSPOT)
// ==========================================
// Connect the car to your phone's hotspot so your phone has internet AND local access
const char* ssid = "MMK-home"; 
const char* password = "a5b4c3d2e1";

// --- FIXED IP CONFIGURATION ---
// Set to 'true' to always use the fixed IP below. 
// Set to 'false' if you want it to use DHCP (random IP) again.
bool useStaticIP = true; 

// Example for Android Hotspots (Gateway is usually 192.168.43.1)
// If using iPhone, change IP to 172.20.10.100 and Gateway to 172.20.10.1
IPAddress local_IP(192, 168, 43, 100); // <-- This will be your FIXED IP
IPAddress gateway(192, 168, 43, 1);    // <-- Your phone's router IP
IPAddress subnet(255, 255, 255, 0);

ESP8266WebServer server(80);

// Sensor Caching Variables
unsigned long lastDHTRead = 0;
unsigned long lastSuccessfulDHTRead = 0;
float cachedTemp = 0.0;
float cachedHum = 0.0;
bool cachedDHTErr = true;
int finalPPM = 0;

// ==========================================
// MOTOR CONTROL LOGIC
// ==========================================
void stopCar()     { digitalWrite(IN1, LOW);  digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, LOW);  }
void moveForward() { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  }
void moveBackward(){ digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); }
void turnLeft()    { digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  }
void turnRight()   { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); }

// ==========================================
// REST API ENDPOINTS
// ==========================================
// Helper to inject CORS headers (Mandatory for Lovable Cloud Hosting)
void enableCORS() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
}

// 1. Health Check Endpoint
void handleRoot() {
  enableCORS();
  server.send(200, "application/json", "{\"status\": \"Neural OS Backend Online\"}");
}

// 2. Motor Action Endpoint
void handleAction() {
  enableCORS();
  if (server.hasArg("dir")) {
    String dir = server.arg("dir");
    if (dir == "F") moveForward();
    else if (dir == "B") moveBackward();
    else if (dir == "L") turnLeft();
    else if (dir == "R") turnRight();
    else if (dir == "S") stopCar();
    else if (dir == "SL") turnLeft(); // Slide Left fallback
    else if (dir == "SR") turnRight(); // Slide Right fallback
  }
  server.send(200, "application/json", "{\"status\": \"success\"}");
}

// 3. Telemetry Endpoint
void handleData() {
  enableCORS();
  String json = "{\"t\":" + String(cachedDHTErr ? 0.0 : cachedTemp) + 
                ", \"h\":" + String(cachedDHTErr ? 0.0 : cachedHum) + 
                ", \"g\":" + String(finalPPM) + 
                ", \"dht_err\":" + String(cachedDHTErr ? "true" : "false") + "}";
  server.send(200, "application/json", json);
}

// Handle Preflight OPTIONS requests for CORS
void handleOptions() {
  enableCORS();
  server.send(204);
}

// ==========================================
// SETUP & LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  dht.begin();
  
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  stopCar();

  // Populate cache instantly on boot
  lastDHTRead = millis();
  cachedTemp = dht.readTemperature();
  cachedHum = dht.readHumidity();
  cachedDHTErr = isnan(cachedTemp) || isnan(cachedHum);
  if (!cachedDHTErr) lastSuccessfulDHTRead = millis();
  finalPPM = 350; 

  // Connect to Wi-Fi (Station Mode)
  WiFi.mode(WIFI_STA);

  // Apply Static IP if configured
  if (useStaticIP) {
    Serial.println("\n[SYSTEM] Attempting Static IP Configuration...");
    if (!WiFi.config(local_IP, gateway, subnet)) {
      Serial.println("[ERROR] Static IP Configuration Failed! Reverting to DHCP...");
    } else {
      Serial.println("[OK] Static IP Configured.");
    }
  } else {
    Serial.println("\n[SYSTEM] Using DHCP for IP allocation.");
  }

  WiFi.begin(ssid, password);
  Serial.print("[WIFI] Connecting to: ");
  Serial.println(ssid);
  
  int retryCount = 0;
  while (WiFi.status() != WL_CONNECTED && retryCount < 40) {
    delay(500);
    Serial.print(".");
    retryCount++;
    if (retryCount == 20) Serial.println("\n[WIFI] Still connecting... Check your Hotspot/Router.");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n\n--- HAZARD RECON BACKEND ONLINE ---");
    Serial.print("[NETWORK] IP ADDRESS: http://"); 
    Serial.println(WiFi.localIP());
    Serial.print("[NETWORK] Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.println("-----------------------------------\n");
  } else {
    Serial.println("\n[CRITICAL] WiFi Connection Failed! Please check SSID/Password.");
  }

  // Setup mDNS responder
  if (MDNS.begin("hazardrecon")) {
    Serial.println("mDNS responder started: http://hazardrecon.local");
    MDNS.addService("http", "tcp", 80);
  }

  // Mount API Endpoints
  server.on("/", HTTP_GET, handleRoot);
  server.on("/action", HTTP_GET, handleAction);
  server.on("/data", HTTP_GET, handleData); 
  server.onNotFound(handleOptions); // Handle CORS preflight
  
  server.begin();
}

void loop() {
  MDNS.update(); // Keep mDNS running
  server.handleClient();
  
  // Non-blocking Sensor Polling
  unsigned long currentMillis = millis();
  if (currentMillis - lastDHTRead >= 2500) {
    lastDHTRead = currentMillis;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    
    if (!isnan(t) && !isnan(h)) {
        cachedTemp = t;
        cachedHum = h;
        cachedDHTErr = false;
        lastSuccessfulDHTRead = currentMillis;
    } else if (currentMillis - lastSuccessfulDHTRead > 10000) {
        cachedDHTErr = true;
    }

    int rawADC = analogRead(MQ_PIN);
    finalPPM = 300 + (pow(rawADC, 2) / 150.0);
    if (finalPPM < 300) finalPPM = 300; 
  }
}