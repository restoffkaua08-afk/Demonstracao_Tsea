#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "COLOQUE_O_NOME_DO_WIFI";
const char* WIFI_PASS = "COLOQUE_A_SENHA_DO_WIFI";

// Troque pelo IP do computador que roda o Gateway.
// Exemplo: http://192.168.0.10:8020
const char* GATEWAY_BASE = "http://192.168.0.10:8020";

// Saídas demonstrativas.
// Use primeiro LEDs ou relés SEM carga perigosa.
// Só conecte bomba real depois de validar a bancada com instrutor.
const int PIN_B1 = 25;
const int PIN_B2 = 26;
const int PIN_OIL = 27;
const int PIN_ALARM_GREEN = 16;
const int PIN_ALARM_YELLOW = 17;
const int PIN_ALARM_RED = 18;

// Entradas.
const int PIN_EMERGENCY = 14;
const int PIN_SENSOR = 34;

unsigned long lastCycle = 0;
int elapsedSeconds = 0;

float readPressureMbar() {
  int raw = analogRead(PIN_SENSOR);

  // Conversão inicial demonstrativa.
  // Substituir pela curva real do sensor usado:
  // pressão = f(tensão ou leitura ADC).
  float pressure = 1013.0 - (raw / 4095.0) * 1013.0;

  if (pressure < 0.01) pressure = 0.01;
  if (pressure > 1013.0) pressure = 1013.0;

  return pressure;
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

bool httpPost(String path, String json) {
  if (WiFi.status() != WL_CONNECTED) return false;

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

  return code >= 200 && code < 300;
}

void allOutputsOff() {
  digitalWrite(PIN_B1, LOW);
  digitalWrite(PIN_B2, LOW);
  digitalWrite(PIN_OIL, LOW);
  digitalWrite(PIN_ALARM_GREEN, LOW);
  digitalWrite(PIN_ALARM_YELLOW, LOW);
  digitalWrite(PIN_ALARM_RED, HIGH);
}

String getJsonString(JsonDocument& doc, const char* key, const char* fallback) {
  if (doc[key].is<const char*>()) return String(doc[key].as<const char*>());
  return String(fallback);
}

void acknowledgeCommand(String commandId, bool applied, String message) {
  StaticJsonDocument<512> ack;

  ack["command_id"] = commandId;
  ack["applied"] = applied;
  ack["message"] = message;

  String body;
  serializeJson(ack, body);

  httpPost("/api/hardware/command-ack", body);
}

void applyDesiredOutputs(String body) {
  if (body.length() == 0) {
    allOutputsOff();
    return;
  }

  StaticJsonDocument<1536> doc;
  DeserializationError error = deserializeJson(doc, body);

  if (error) {
    Serial.print("Erro JSON desired-outputs: ");
    Serial.println(error.c_str());
    allOutputsOff();
    return;
  }

  String commandId = getJsonString(doc, "command_id", "SEM_ID");

  JsonObject outputs = doc["outputs"];
  JsonObject safety = doc["safety"];

  bool emergencyStop = outputs["emergency_stop"] | true;
  bool allowedToRun = doc["allowed_to_run"] | false;

  bool pumpB1 = outputs["pump_b1"] | false;
  bool pumpB2 = outputs["pump_b2"] | false;
  bool oilValve = outputs["oil_valve"] | false;
  bool green = outputs["alarm_green"] | false;
  bool yellow = outputs["alarm_yellow"] | false;
  bool red = outputs["alarm_red"] | false;

  bool localEmergency = digitalRead(PIN_EMERGENCY) == LOW;

  if (!allowedToRun || emergencyStop || localEmergency) {
    digitalWrite(PIN_B1, LOW);
    digitalWrite(PIN_B2, LOW);
    digitalWrite(PIN_OIL, LOW);
    digitalWrite(PIN_ALARM_GREEN, LOW);
    digitalWrite(PIN_ALARM_YELLOW, LOW);
    digitalWrite(PIN_ALARM_RED, HIGH);

    acknowledgeCommand(commandId, true, "Comando seguro aplicado: saidas desligadas.");
    return;
  }

  digitalWrite(PIN_B1, pumpB1 ? HIGH : LOW);
  digitalWrite(PIN_B2, pumpB2 ? HIGH : LOW);
  digitalWrite(PIN_OIL, oilValve ? HIGH : LOW);
  digitalWrite(PIN_ALARM_GREEN, green ? HIGH : LOW);
  digitalWrite(PIN_ALARM_YELLOW, yellow ? HIGH : LOW);
  digitalWrite(PIN_ALARM_RED, red ? HIGH : LOW);

  acknowledgeCommand(commandId, true, "Comando aplicado pelo ESP32.");
}

void sendHardwareState() {
  bool emergency = digitalRead(PIN_EMERGENCY) == LOW;
  bool b1State = digitalRead(PIN_B1) == HIGH;
  bool b2State = digitalRead(PIN_B2) == HIGH;
  bool oilState = digitalRead(PIN_OIL) == HIGH;

  float pressure = readPressureMbar();
  float hoseLoss = 1.2;
  float tankPressure = pressure + hoseLoss;
  float oilInjected = oilState ? max(0, elapsedSeconds - 90) * 0.75 : 0;

  String status = emergency ? "BLOQUEADO" : "EM_CICLO";
  String stage = emergency ? "BLOQUEADO" : "VACUO_INICIAL";

  if (!emergency && elapsedSeconds >= 24 && elapsedSeconds < 90) {
    stage = "VACUO_PROFUNDO";
  }

  if (!emergency && elapsedSeconds >= 90) {
    stage = "INJECAO_DE_OLEO";
  }

  StaticJsonDocument<1536> doc;

  doc["status"] = status;
  doc["stage"] = stage;
  doc["elapsed_seconds"] = elapsedSeconds;
  doc["pressure_machine_mbar"] = pressure;

  JsonObject pumps = doc.createNestedObject("pumps");
  pumps["b1"] = b1State;
  pumps["b2"] = b2State;
  pumps["oil"] = oilState;

  JsonObject oil = doc.createNestedObject("oil");
  oil["injected_l"] = oilInjected;
  oil["remaining_l"] = max(0.0f, 120.0f - oilInjected);
  oil["flow_l_min"] = oilState ? 1.5 : 0.0;

  JsonObject hardware = doc.createNestedObject("hardware");
  hardware["sensor_online"] = true;
  hardware["plc_online"] = true;
  hardware["emergency"] = emergency;

  JsonArray tanks = doc.createNestedArray("tanks");
  JsonObject tank = tanks.createNestedObject();
  tank["id"] = "T1";
  tank["pressure_mbar"] = tankPressure;
  tank["machine_pressure_mbar"] = pressure;
  tank["hose_loss_mbar"] = hoseLoss;
  tank["oil_in_l"] = oilInjected;
  tank["risk_pct"] = 18;

  if (emergency) {
    doc["alarm"] = "EMERGENCIA_FISICA";
  } else {
    doc["alarm"] = nullptr;
  }

  String body;
  serializeJson(doc, body);

  httpPost("/api/hardware/ingest", body);
  Serial.println(body);
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
  pinMode(PIN_SENSOR, INPUT);

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

void loop() {
  unsigned long nowMs = millis();

  if (nowMs - lastCycle < 1000) {
    return;
  }

  lastCycle = nowMs;
  elapsedSeconds++;

  String desired = httpGet("/api/hardware/desired-outputs");
  applyDesiredOutputs(desired);

  sendHardwareState();
}