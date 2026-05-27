#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "COLOQUE_O_NOME_DO_WIFI";
const char* WIFI_PASS = "COLOQUE_A_SENHA_DO_WIFI";

// Troque pelo IP do computador que roda o Gateway.
// Exemplo: http://192.168.0.10:8020
const char* GATEWAY_BASE = "http://192.168.0.10:8020";

const int PIN_B1 = 25;
const int PIN_B2 = 26;
const int PIN_OIL = 27;
const int PIN_ALARM_GREEN = 16;
const int PIN_ALARM_YELLOW = 17;
const int PIN_ALARM_RED = 18;
const int PIN_EMERGENCY = 14;
const int PIN_SENSOR = 34;

unsigned long lastCycle = 0;
int elapsedSeconds = 0;

float readPressureMbar() {
  int raw = analogRead(PIN_SENSOR);

  // Conversao inicial demonstrativa.
  // Substitua pela curva real do sensor usado no prototipo.
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
  pinMode(PIN_ALARM_GREEN, OUTPUT);
  pinMode(PIN_ALARM_YELLOW, OUTPUT);
  pinMode(PIN_ALARM_RED, OUTPUT);
  pinMode(PIN_EMERGENCY, INPUT_PULLUP);

  digitalWrite(PIN_B1, LOW);
  digitalWrite(PIN_B2, LOW);
  digitalWrite(PIN_OIL, LOW);
  digitalWrite(PIN_ALARM_GREEN, LOW);
  digitalWrite(PIN_ALARM_YELLOW, LOW);
  digitalWrite(PIN_ALARM_RED, LOW);

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.println("Conectando Wi-Fi...");
  }

  Serial.print("ESP32 conectado. IP: ");
  Serial.println(WiFi.localIP());
}

String httpGet(String path) {
  if (WiFi.status() != WL_CONNECTED) return "";

  HTTPClient http;
  String url = String(GATEWAY_BASE) + path;
  http.begin(url);

  int code = http.GET();
  String body = "";

  if (code > 0) {
    body = http.getString();
  }

  http.end();

  return body;
}

void httpPost(String path, String json) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(GATEWAY_BASE) + path;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(json);

  Serial.print("POST ");
  Serial.print(path);
  Serial.print(" -> ");
  Serial.println(code);

  http.end();
}

void applyDesiredOutputs(String body) {
  // Parser simples para demonstracao.
  // Para projeto final, usar ArduinoJson.
  bool pumpB1 = body.indexOf("\"pump_b1\":true") >= 0;
  bool pumpB2 = body.indexOf("\"pump_b2\":true") >= 0;
  bool oilValve = body.indexOf("\"oil_valve\":true") >= 0;
  bool green = body.indexOf("\"alarm_green\":true") >= 0;
  bool yellow = body.indexOf("\"alarm_yellow\":true") >= 0;
  bool red = body.indexOf("\"alarm_red\":true") >= 0;
  bool stop = body.indexOf("\"emergency_stop\":true") >= 0;

  digitalWrite(PIN_B1, (!stop && pumpB1) ? HIGH : LOW);
  digitalWrite(PIN_B2, (!stop && pumpB2) ? HIGH : LOW);
  digitalWrite(PIN_OIL, (!stop && oilValve) ? HIGH : LOW);
  digitalWrite(PIN_ALARM_GREEN, green ? HIGH : LOW);
  digitalWrite(PIN_ALARM_YELLOW, yellow ? HIGH : LOW);
  digitalWrite(PIN_ALARM_RED, red ? HIGH : LOW);
}

void loop() {
  unsigned long now = millis();

  if (now - lastCycle < 1000) {
    return;
  }

  lastCycle = now;
  elapsedSeconds++;

  bool emergency = digitalRead(PIN_EMERGENCY) == LOW;
  float pressure = readPressureMbar();

  String desired = httpGet("/api/hardware/desired-outputs");
  applyDesiredOutputs(desired);

  bool b1State = digitalRead(PIN_B1) == HIGH;
  bool b2State = digitalRead(PIN_B2) == HIGH;
  bool oilState = digitalRead(PIN_OIL) == HIGH;

  String status = emergency ? "BLOQUEADO" : "EM_CICLO";
  String stage = emergency ? "BLOQUEADO" : "VACUO_INICIAL";

  if (!emergency && elapsedSeconds >= 24 && elapsedSeconds < 90) {
    stage = "VACUO_PROFUNDO";
  }

  if (!emergency && elapsedSeconds >= 90) {
    stage = "INJECAO_DE_OLEO";
  }

  float hoseLoss = 1.2;
  float tankPressure = pressure + hoseLoss;
  float oilInjected = oilState ? max(0, elapsedSeconds - 90) * 0.75 : 0;

  String json = "{";
  json += "\"status\":\"" + status + "\",";
  json += "\"stage\":\"" + stage + "\",";
  json += "\"elapsed_seconds\":" + String(elapsedSeconds) + ",";
  json += "\"pressure_machine_mbar\":" + String(pressure, 2) + ",";
  json += "\"pumps\":{";
  json += "\"b1\":" + String(b1State ? "true" : "false") + ",";
  json += "\"b2\":" + String(b2State ? "true" : "false") + ",";
  json += "\"oil\":" + String(oilState ? "true" : "false");
  json += "},";
  json += "\"oil\":{";
  json += "\"injected_l\":" + String(oilInjected, 2) + ",";
  json += "\"remaining_l\":" + String(max(0.0f, 120.0f - oilInjected), 2) + ",";
  json += "\"flow_l_min\":" + String(oilState ? 1.5 : 0.0, 2);
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

  httpPost("/api/hardware/ingest", json);

  Serial.println(json);
}