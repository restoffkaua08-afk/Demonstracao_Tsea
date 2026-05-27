#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "COLOQUE_O_NOME_DO_WIFI";
const char* WIFI_PASS = "COLOQUE_A_SENHA_DO_WIFI";
const char* GATEWAY_URL = "http://192.168.0.10:8020/api/hardware/ingest";

const int PIN_B1 = 25;
const int PIN_B2 = 26;
const int PIN_OIL = 27;
const int PIN_EMERGENCY = 14;
const int PIN_SENSOR = 34;

unsigned long lastSend = 0;
int elapsedSeconds = 0;

float readPressureMbar() {
  int raw = analogRead(PIN_SENSOR);
  float pressure = 1013.0 - (raw / 4095.0) * 1013.0;

  if (pressure < 0.01) pressure = 0.01;
  if (pressure > 1013.0) pressure = 1013.0;

  return pressure;
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_B1, OUTPUT);
  pinMode(PIN_B2, OUTPUT);
  pinMode(PIN_OIL, OUTPUT);
  pinMode(PIN_EMERGENCY, INPUT_PULLUP);

  digitalWrite(PIN_B1, LOW);
  digitalWrite(PIN_B2, LOW);
  digitalWrite(PIN_OIL, LOW);

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.println("Conectando Wi-Fi...");
  }

  Serial.print("ESP32 conectado. IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  unsigned long now = millis();

  if (now - lastSend < 1000) {
    return;
  }

  lastSend = now;
  elapsedSeconds++;

  bool emergency = digitalRead(PIN_EMERGENCY) == LOW;
  float pressure = readPressureMbar();

  bool b1 = !emergency && elapsedSeconds >= 1;
  bool b2 = !emergency && elapsedSeconds >= 24 && elapsedSeconds < 90;
  bool oil = !emergency && elapsedSeconds >= 90;

  digitalWrite(PIN_B1, b1 ? HIGH : LOW);
  digitalWrite(PIN_B2, b2 ? HIGH : LOW);
  digitalWrite(PIN_OIL, oil ? HIGH : LOW);

  String status = emergency ? "BLOQUEADO" : "EM_CICLO";
  String stage = "VACUO_INICIAL";

  if (emergency) {
    stage = "BLOQUEADO";
  } else if (elapsedSeconds < 24) {
    stage = "VACUO_INICIAL";
  } else if (elapsedSeconds < 90) {
    stage = "VACUO_PROFUNDO";
  } else if (elapsedSeconds < 165) {
    stage = "INJECAO_DE_OLEO";
  } else {
    stage = "ESTABILIZACAO";
  }

  float hoseLoss = 1.2;
  float tankPressure = pressure + hoseLoss;
  float oilInjected = oil ? (elapsedSeconds - 90) * 0.75 : 0;

  if (oilInjected < 0) oilInjected = 0;

  String json = "{";
  json += "\"status\":\"" + status + "\",";
  json += "\"stage\":\"" + stage + "\",";
  json += "\"elapsed_seconds\":" + String(elapsedSeconds) + ",";
  json += "\"pressure_machine_mbar\":" + String(pressure, 2) + ",";
  json += "\"pumps\":{";
  json += "\"b1\":" + String(b1 ? "true" : "false") + ",";
  json += "\"b2\":" + String(b2 ? "true" : "false") + ",";
  json += "\"oil\":" + String(oil ? "true" : "false");
  json += "},";
  json += "\"oil\":{";
  json += "\"injected_l\":" + String(oilInjected, 2) + ",";
  json += "\"remaining_l\":" + String(max(0.0f, 120.0f - oilInjected), 2) + ",";
  json += "\"flow_l_min\":" + String(oil ? 1.5 : 0.0, 2);
  json += "},";
  json += "\"hardware\":{";
  json += "\"sensor_online\":true,";
  json += "\"plc_online\":true,";
  json += "\"emergency\":" + String(emergency ? "true" : "false");
  json += "},";
  json += "\"tanks\":[{";
  json += "\"id\":\"T1\",";
  json += "\"pressure_mbar\":" + String(tankPressure, 2) + ",";
  json += "\"machine_pressure_mbar\":" + String(pressure, 2) + ",";
  json += "\"hose_loss_mbar\":" + String(hoseLoss, 2) + ",";
  json += "\"oil_in_l\":" + String(oilInjected, 2) + ",";
  json += "\"risk_pct\":18";
  json += "}],";
  json += "\"alarm\":";
  json += emergency ? "\"EMERGENCIA_FISICA\"" : "null";
  json += "}";

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(GATEWAY_URL);
    http.addHeader("Content-Type", "application/json");

    int code = http.POST(json);
    Serial.print("POST Gateway: ");
    Serial.println(code);
    Serial.println(json);

    http.end();
  } else {
    Serial.println("Wi-Fi desconectado.");
  }
}