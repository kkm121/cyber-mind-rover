/*************************************************************
  HAZARD RECON — GLOBAL NEURAL OS FIRMWARE (BLYNK VERSION)
  
  This version allows you to control your car from ANYWHERE in the 
  world. It connects to the Blynk Cloud instead of a local IP.
  
  Instructions:
  1. Install "Blynk" library in Arduino IDE.
  2. Create a Template in Blynk.cloud named "Hazard Recon".
  3. Add Datastreams:
     - V0 (Virtual Pin, String) -> Commands
     - V1 (Virtual Pin, Double) -> Temperature
     - V2 (Virtual Pin, Double) -> Humidity
     - V3 (Virtual Pin, Integer) -> Gas PPM
  4. Paste your Template ID, Name, and Auth Token below.
 *************************************************************/

/* Fill in information from Blynk Device Info here */
#define BLYNK_TEMPLATE_ID "TMPLxxxxxx"
#define BLYNK_TEMPLATE_NAME "Hazard Recon"
#define BLYNK_AUTH_TOKEN "YourAuthToken"

#include <ESP8266WiFi.h>
#include <BlynkSimpleEsp8266.h>
#include <DHT.h>

// ==========================================
// HARDWARE PIN DEFINITIONS
// ==========================================
const int IN1 = 5;  // D1 (Forward Left)
const int IN2 = 4;  // D2 (Reverse Left)
const int IN3 = 2;  // D4 (Forward Right)
const int IN4 = 14; // D5 (Reverse Right)

#define DHTPIN 13     // D7
#define DHTTYPE DHT11 
DHT dht(DHTPIN, DHTTYPE);
const int MQ_PIN = A0; 

// ==========================================
// NETWORK CONFIGURATION
// ==========================================
char ssid[] = "YourWiFiName";
char pass[] = "YourWiFiPassword";

// ==========================================
// MOTOR CONTROL LOGIC
// ==========================================
void stopCar()     { digitalWrite(IN1, LOW);  digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, LOW);  }
void moveForward() { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  }
void moveBackward(){ digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); }
void turnLeft()    { digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  }
void turnRight()   { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); }

// ==========================================
// BLYNK COMMAND HANDLER (GLOBAL CONTROL)
// ==========================================
// This function triggers whenever the Value of V0 changes in the Cloud
BLYNK_WRITE(V0) {
  String cmd = param.asStr();
  Serial.print("[COMMAND] Recieved from Cloud: ");
  Serial.println(cmd);

  if (cmd == "F") moveForward();
  else if (cmd == "B") moveBackward();
  else if (cmd == "L") turnLeft();
  else if (cmd == "R") turnRight();
  else if (cmd == "S") stopCar();
  else stopCar(); // Default to stop for safety
}

// ==========================================
// SETUP & LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  stopCar();
  
  dht.begin();

  Serial.println("\n[SYSTEM] Initializing Global Connection...");
  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, pass);
  Serial.println("[SYSTEM] Connected to Blynk Cloud.");
}

void loop() {
  Blynk.run(); // Keeps the connection alive and processes commands

  // Non-blocking Sensor Polling (Every 2 seconds)
  static unsigned long lastMillis = 0;
  if (millis() - lastMillis > 2000) {
    lastMillis = millis();
    
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    int rawADC = analogRead(MQ_PIN);
    int ppm = 300 + (pow(rawADC, 2) / 150.0);

    if (!isnan(t) && !isnan(h)) {
      // Send data to the Cloud
      Blynk.virtualWrite(V1, t);
      Blynk.virtualWrite(V2, h);
      Blynk.virtualWrite(V3, ppm);
      
      Serial.print("[TELEMETRY] Sent to Cloud -> Temp: ");
      Serial.print(t);
      Serial.print(" Gas: ");
      Serial.println(ppm);
    }
  }
}