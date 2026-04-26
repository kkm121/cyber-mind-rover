/*************************************************************
  HAZARD RECON — GLOBAL NEURAL OS FIRMWARE (BLYNK VERSION)
  
  Updated with Slide Command Support (SL/SR)
 *************************************************************/

#define BLYNK_TEMPLATE_ID "TMPL3UCNsNTD2"
#define BLYNK_TEMPLATE_NAME "HazardRecon"
#define BLYNK_AUTH_TOKEN "VOElZHzJVBYw7dv2IFrdPo6wQbZWKbjO"

#include <ESP8266WiFi.h>
#include <BlynkSimpleEsp8266.h>
#include <DHT.h>

const int IN1 = 5;  const int IN2 = 4;  const int IN3 = 2;  const int IN4 = 14;
#define DHTPIN 13
#define DHTTYPE DHT11 
DHT dht(DHTPIN, DHTTYPE);
const int MQ_PIN = A0; 

char ssid[] = "MMK-home";
char pass[] = "a5b4c3d2e1";

void stopCar()     { digitalWrite(IN1, LOW);  digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, LOW);  }
void moveForward() { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  }
void moveBackward(){ digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); }
void turnLeft()    { digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  }
void turnRight()   { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); }

BLYNK_WRITE(V0) {
  String cmd = param.asStr();
  if (cmd == "F") moveForward();
  else if (cmd == "B") moveBackward();
  else if (cmd == "L") turnLeft();
  else if (cmd == "R") turnRight();
  else if (cmd == "SL") turnLeft();  // Slide Left
  else if (cmd == "SR") turnRight(); // Slide Right
  else stopCar();
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  stopCar();
  dht.begin();
  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, pass);
}

void loop() {
  Blynk.run();
  static unsigned long lastMillis = 0;
  if (millis() - lastMillis > 2000) {
    lastMillis = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    int rawADC = analogRead(MQ_PIN);
    int ppm = 300 + (pow(rawADC, 2) / 150.0);
    if (!isnan(t)) {
      Blynk.virtualWrite(V1, t);
      Blynk.virtualWrite(V2, h);
      Blynk.virtualWrite(V3, ppm);
    }
  }
}