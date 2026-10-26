/*
 * Voice-Controlled Flappy Bird - Arduino
 *
 * Board: Arduino UNO R3 or UNO R4
 *
 * Wiring (same pins as the full version)
 *   MAX9814 mic        OUT -> A0     VDD -> 5V    GND -> GND
 *   HC-SR04            Trig -> D10   Echo -> D11  VCC -> 5V  GND -> GND
 *   START button       D12 -> button -> GND
 *   CALIBRATE button   A1  -> button -> GND
 *   MODE button        A2  -> button -> GND
 *
 * Buttons
 *   START      start / restart the game
 *   CALIBRATE  listen to the room for 2 s, then set the threshold automatically
 *   MODE       switch between voice mode and hand mode (ultrasonic)
 *
 * Messages sent to the website (115200 baud, one per line)
 *   182            loudness of the sound (every 20 ms)
 *   JUMP!          voice mode: sound louder than the threshold
 *                  hand mode: hand moved closer than 10 cm
 *   DIST:23        hand distance in cm, smoothed (every 50 ms, 0 = no hand)
 *   MODE:VOICE / MODE:HAND
 *   CMD:START      START button pressed
 *   CAL:START / CAL:DONE
 *   THRESHOLD:350  current threshold
 *
 * Messages received from the website
 *   T400           set threshold to 400
 *   ?              ask for the current threshold
 */

const int MIC_PIN = A0;
const int TRIG_PIN = 10;
const int ECHO_PIN = 11;
const int START_PIN = 12;
const int CAL_PIN = A1;
const int MODE_PIN = A2;

const int SAMPLE_MS = 20;       // measure loudness over 20 ms
const int COOLDOWN_MS = 250;    // minimum time between two jumps
const int DIST_EVERY_MS = 50;   // read the ultrasonic every 50 ms
const int MAX_CM = 60;          // readings further than this are ignored
const int MAX_MISSES = 5;       // keep the last distance for 5 bad readings (0.25 s)
const int HAND_JUMP_CM = 10;    // hand mode: hand closer than this = jump
const int CLICK_IGNORE_MS = 300; // ignore sound after a button press (the mic hears the click)

int threshold = 350;
bool handMode = false;
bool handNear = false;
int distance = 0;               // smoothed distance in cm (0 = no hand)
int lastThree[3];               // last 3 good readings (for the median)
int nextSlot = 0;
int misses = 0;

unsigned long lastJump = 0;
unsigned long lastDist = 0;
unsigned long ledOffTime = 0;
unsigned long ignoreSoundUntil = 0;
String input = "";

// One push button (debounced)
struct Button {
  int pin;
  bool lastReading;       // last value from digitalRead
  bool isDown;            // stable state: true = pressed
  unsigned long changed;  // when the reading last changed
};
Button startButton = {START_PIN, HIGH, false, 0};
Button calButton   = {CAL_PIN,   HIGH, false, 0};
Button modeButton  = {MODE_PIN,  HIGH, false, 0};

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(START_PIN, INPUT_PULLUP);   // pressed = LOW
  pinMode(CAL_PIN, INPUT_PULLUP);
  pinMode(MODE_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);

  printThreshold();
  Serial.println("MODE:VOICE");
}

void loop() {
  readWebsite();
  readButtons();

  if (millis() - lastDist >= DIST_EVERY_MS) {
    lastDist = millis();
    distance = readSmoothDistance();
    Serial.print("DIST:");
    Serial.println(distance);
    if (handMode) checkHand();
  }

  int volume = readVolume();
  Serial.println(volume);

  // The mic hears the click of a button: ignore sound while a button is down and 300 ms after
  if (anyButtonDown()) ignoreSoundUntil = millis() + CLICK_IGNORE_MS;
  bool soundAllowed = millis() >= ignoreSoundUntil;

  if (!handMode && soundAllowed && volume > threshold && millis() - lastJump >= COOLDOWN_MS) {
    jump();
  }

  if (ledOffTime != 0 && millis() >= ledOffTime) {
    digitalWrite(LED_BUILTIN, LOW);
    ledOffTime = 0;
  }
}

void jump() {
  lastJump = millis();
  Serial.println("JUMP!");
  digitalWrite(LED_BUILTIN, HIGH);   // the "L" LED blinks on every jump
  ledOffTime = millis() + 80;
}

// Hand mode: moving the hand closer than HAND_JUMP_CM counts as one jump.
// The hand must move away (more than HAND_JUMP_CM + 3 cm) before it can jump again.
void checkHand() {
  if (!handNear && distance > 0 && distance < HAND_JUMP_CM) {
    handNear = true;
    if (millis() - lastJump >= COOLDOWN_MS) jump();
  } else if (handNear && (distance == 0 || distance > HAND_JUMP_CM + 3)) {
    handNear = false;
  }
}

// Loudness = highest reading - lowest reading in SAMPLE_MS
int readVolume() {
  int low = 1023;
  int high = 0;
  unsigned long start = millis();
  while (millis() - start < SAMPLE_MS) {
    int value = analogRead(MIC_PIN);
    low = min(low, value);
    high = max(high, value);
  }
  return high - low;
}

// Smoothed distance:
//  1. a missed echo (0) or a reading further than MAX_CM keeps the last distance,
//     and only after MAX_MISSES bad readings in a row do we report 0 (hand gone)
//  2. the median of the last 3 good readings removes single wrong readings (spikes)
int readSmoothDistance() {
  int cm = readDistance();

  if (cm == 0 || cm > MAX_CM) {
    misses++;
    if (misses > MAX_MISSES) return 0;
    return distance;
  }
  misses = 0;

  if (distance == 0) {              // hand just appeared: start the history fresh
    lastThree[0] = cm;
    lastThree[1] = cm;
    lastThree[2] = cm;
  }
  lastThree[nextSlot] = cm;
  nextSlot = (nextSlot + 1) % 3;
  return medianOf3(lastThree[0], lastThree[1], lastThree[2]);
}

int medianOf3(int a, int b, int c) {
  return max(min(a, b), min(max(a, b), c));
}

// Raw distance in cm from the HC-SR04 (0 = no echo within ~2 m)
int readDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 12000);
  return duration / 58;
}

void readButtons() {
  if (wasPressed(startButton)) {
    Serial.println("CMD:START");
  }
  if (wasPressed(calButton)) {
    calibrate();
  }
  if (wasPressed(modeButton)) {
    handMode = !handMode;
    handNear = false;
    Serial.println(handMode ? "MODE:HAND" : "MODE:VOICE");
  }
}

bool anyButtonDown() {
  return digitalRead(START_PIN) == LOW || digitalRead(CAL_PIN) == LOW || digitalRead(MODE_PIN) == LOW;
}

// True once per press. Button contacts bounce, so the reading must stay
// the same for 15 ms before it counts, and the button must be released
// before it can count again.
bool wasPressed(Button &b) {
  bool reading = digitalRead(b.pin);
  if (reading != b.lastReading) {
    b.lastReading = reading;
    b.changed = millis();
  }
  if (millis() - b.changed < 15) return false;   // still bouncing

  bool down = (reading == LOW);
  bool justPressed = down && !b.isDown;
  b.isDown = down;
  return justPressed;
}

// Listen to the room for 2 seconds, then
// threshold = loudest noise x 1.5 + 30  (between 40 and 1000)
void calibrate() {
  Serial.println("CAL:START");
  delay(300);                          // let the button click fade

  int loudest = 0;
  for (int i = 0; i < 100; i++) {      // 100 x 20 ms = 2 seconds
    int volume = readVolume();
    Serial.println(volume);
    loudest = max(loudest, volume);
  }
  threshold = constrain(loudest + loudest / 2 + 30, 40, 1000);

  Serial.println("CAL:DONE");
  printThreshold();
}

void printThreshold() {
  Serial.print("THRESHOLD:");
  Serial.println(threshold);
}

// Read "T400" or "?" lines from the website
void readWebsite() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      if (input.startsWith("T")) {
        int value = input.substring(1).toInt();
        if (value > 0 && value <= 1023) threshold = value;
        printThreshold();
      } else if (input == "?") {
        printThreshold();
      }
      input = "";
    } else if (c != '\r') {
      input += c;
    }
  }
}