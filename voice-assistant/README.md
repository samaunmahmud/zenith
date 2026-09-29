# Voice Assistant for macOS

A push-to-talk voice assistant in Python. Hold a key, say what you want, let go. It can:

| You say | Intent | What happens |
|---|---|---|
| "Open Spotify" / "launch VS code" / "switch to Safari" | `OPEN_APP` | The app is found on disk, launched or focused with AppleScript, and the assistant waits until it's in front |
| "Type thanks, I'll review it tomorrow" / "write an email asking for Friday off" | `WRITE_TEXT` | Gemini writes the text, then it's typed at your cursor |
| "Open Notes and write a shopping list for tacos" | `WRITE_TEXT` + app | Opens Notes first, then types into it |
| "What's the capital of Australia?" / "What's 15% of 80?" | `ANSWER_QUESTION` | The answer is printed and read aloud |
| *(mumbling, cut-off sentences)* | `UNCLEAR` | It asks you to repeat instead of guessing |

```
 hold ⌥ (right)          release
      │                     │
      ▼                     ▼
┌───────────┐  WAV (default: one call)    ┌──────────────┐  JSON action  ┌──────────────────┐
│ audio.py  │───────────────────────────▶│ ai_client.py │─────────────▶│ mac_controller.py│
│ mic + key │                             │ Gemini:      │               │ osascript, typing│
│ listener  │──▶ stt.py ──text──────────▶│ transcript + │               │ `say`, sounds    │
└───────────┘  (optional: Whisper, local, │ intent+reply │               └──────────────────┘
                Google, Gemini)           └──────────────┘
                     main.py runs the steps in order and handles every error
```

## Project structure

```
voice-assistant/
├── voice_assistant/
│   ├── main.py            # Entry point and orchestrator: the listening loop, steps 1-4, error reporting
│   ├── ai_client.py       # Gemini "brain": system prompt, JSON schema, Pydantic validation, retries, memory
│   ├── mac_controller.py  # App lookup + AppleScript launch/focus, typing/pasting, text-to-speech, sounds
│   ├── audio.py           # Microphone recorder (sounddevice) and the global push-to-talk hotkey (pynput)
│   ├── stt.py             # Optional separate speech-to-text: gemini, openai (Whisper API), local (faster-whisper), google
│   ├── permissions.py     # Detects missing Accessibility / Input Monitoring permissions (macOS fails silently)
│   ├── doctor.py          # `--doctor`: checks packages, permissions, microphone, API key and automation
│   ├── config.py          # All settings, read from .env / environment variables and validated
│   ├── retry.py           # Exponential backoff with jitter for rate limits and network errors
│   └── __main__.py        # Lets you run `python -m voice_assistant`
├── tests/                 # Unit tests with fakes (run anywhere) + macOS integration tests (run on a Mac)
├── requirements.txt
├── requirements-dev.txt
└── .env.example           # Every setting, documented
```

## Setup

### 1. Prerequisites

- macOS 12 or later (Intel or Apple Silicon)
- Python 3.10+ (3.12 recommended). Check with `python3 --version`. If you need to install it:
  ```bash
  # Homebrew: https://brew.sh
  brew install python@3.12
  ```
- Xcode Command Line Tools, used to build some dependencies: `xcode-select --install`

You don't need PortAudio or PyAudio. Audio goes through `sounddevice`, whose macOS wheel includes PortAudio. You only need `brew install portaudio` if you want to use `SpeechRecognition`'s own `Microphone` class elsewhere, and this project doesn't.

### 2. Create a virtual environment and install dependencies

```bash
cd voice-assistant
python3 -m venv .venv
source .venv/bin/activate          # run this again in every new terminal
python -m pip install --upgrade pip
pip install -r requirements.txt

# Optional, for fully offline speech recognition (STT_BACKEND=local):
pip install faster-whisper
```

### 3. Configure your API key

```bash
cp .env.example .env
open -e .env                       # or any editor
```

Set `GEMINI_API_KEY` (you can create one for free at <https://aistudio.google.com/apikey>). That single key is all you need: by default the recording goes straight to Gemini, which transcribes and decides in one call. To use the OpenAI Whisper API for transcription instead, set `STT_BACKEND=openai` and `OPENAI_API_KEY`.

`.env` is git-ignored. Don't commit it.

### 4. Grant macOS permissions

macOS grants these to the app that runs Python, not to Python itself. That means Terminal, iTerm2 or VS Code, whichever one you start the assistant from. Open **System Settings → Privacy & Security**, turn your terminal on in each of these sections, then **quit and reopen the terminal**:

| Permission | Why it's needed |
|---|---|
| **Microphone** | Recording your voice. macOS asks the first time you press the hotkey |
| **Input Monitoring** | Detecting the global push-to-talk hotkey while another app is focused |
| **Accessibility** | Typing text (`pyautogui`) and pasting with ⌘V (System Events) |
| **Automation → System Events** | Reading the frontmost app and pasting. macOS asks on first use; click OK |

### 5. Check the setup

```bash
python -m voice_assistant --doctor
```

The doctor checks your Python version, packages, permissions and API key. It also records two seconds from your microphone and runs a real test request to Gemini. For each problem it prints the fix, and it opens System Settings at the right pane for any missing permission. Run it again after changing permissions (and restarting the terminal) until everything shows ✅.

### 6. Run it

```bash
python -m voice_assistant
```

```
18:02:11 INFO    Model gemini-flash-latest | STT gemini-direct | hotkey alt_r (hold)

✨ Ready. Hold [alt_r] and speak. Press Ctrl+C to quit.

18:02:15 INFO    [1/4] 🎙  Listening... (release to finish)
18:02:17 INFO    [2/4] 🧠 Sending 1.6s of audio to Gemini (transcribe + decide in one call)
18:02:17 INFO    [3/4] 🧠 Thinking... (frontmost: Notes)
18:02:18 INFO    [3/4] 📝 Heard: "Open Spotify."
18:02:18 INFO    [3/4] 🧠 Intent OPEN_APP (confidence 0.98) in 0.84s
18:02:18 INFO    [4/4] ⚙️  Opening app 'Spotify'
✅ Opened Spotify
18:02:19 INFO    Ready for the next command.
```

Hold **Right Option (⌥)** while you speak and release when you're done. To write text, click into a text field first (Notes, Mail, a browser, VS Code), then say "type …" or "write …".

Useful flags:

```bash
python -m voice_assistant --doctor        # check the whole setup and exit
python -m voice_assistant --text          # type commands instead of speaking (tests the brain without a mic)
python -m voice_assistant --dry-run       # log what it WOULD do; opens, types and says nothing
python -m voice_assistant --toggle        # tap the hotkey to start, tap again to stop
python -m voice_assistant --hotkey f8     # use a different key (cmd_r, ctrl_r, f13, ...)
python -m voice_assistant --stt local     # offline transcription
python -m voice_assistant --no-speak      # print answers only
python -m voice_assistant --debug         # verbose logs, including library internals
```

### 7. Run the tests (optional)

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

On a Mac this also runs `tests/test_macos_integration.py` against the real `osascript`, AppKit clipboard and `/Applications`. Other systems skip those tests. CI (`.github/workflows/voice-assistant.yml`) runs everything on both Ubuntu and macOS.

## How it works

### Listening loop (`audio.py`)
A `pynput` listener on a background thread watches for the hotkey. Pressing it starts a `sounddevice` input stream (16 kHz mono float32) that collects audio in a callback. Releasing it closes the stream and puts an `AudioClip` on a queue. The main thread takes one clip at a time and marks itself busy, so pressing the hotkey mid-command won't start a second command on top of the first. Starting to talk also cuts off any answer that's still being read aloud.

Before a clip is sent anywhere, very short taps (under 0.35 s) and near-silent recordings are dropped. This saves API calls and avoids Whisper's habit of transcribing silence as "Thank you."

### Speech-to-text
By default (`STT_BACKEND=gemini-direct`) there's no separate transcription step. The WAV goes straight to the brain (`GeminiBrain.decide_audio`), and Gemini fills a `transcript` field before choosing the intent. That saves a full API round trip on every command. Only the transcript text is kept in the conversation memory, never the audio, so follow-up requests stay small.

To transcribe with something else, set `STT_BACKEND` to one of the four backends in `stt.py`: `gemini`, `openai`, `local` or `google`. They share one `transcribe(clip) -> str` interface. An empty string means "heard nothing intelligible", and a `TranscriptionError` means the service itself failed. The two cases get different spoken replies.

### The brain (`ai_client.py`)
A single Gemini call does both the classification and the generation. The system prompt defines the intents with rules and few-shot examples. Structured output (`response_mime_type="application/json"` plus an explicit `response_schema` whose `intent` is an enum) forces a reply like:

```json
{"intent": "WRITE_TEXT", "app_name": "Notes", "text": "Tacos\n- tortillas\n- ...", "answer": null, "confidence": 0.93}
```

Pydantic validates the reply again. If an action is missing its payload (say, `OPEN_APP` with no app name), it's downgraded to `UNCLEAR`. `OPEN_APP` or `WRITE_TEXT` with confidence below 0.45 asks you to confirm instead of acting. The last few exchanges are sent along with each request, so follow-ups like "make it more formal" work. Each request also includes the local time and the frontmost app, which helps with "what day is it" or with choosing code over prose when you're in VS Code.

### macOS control (`mac_controller.py`)
- **Opening apps.** The spoken name goes through a lookup chain: alias table ("VS code" → Visual Studio Code) → exact name → name without spaces ("x code" → Xcode) → whole-word match ("photoshop" → Adobe Photoshop 2025) → fuzzy match ("spotfy" → Spotify) → Spotlight (`mdfind`). The app is then activated by bundle id with `osascript`, falling back to `open`. The lookup has to come first because `tell application "Typo"` makes macOS pop a blocking "Where is Typo?" dialog. After launching, the assistant polls until the app is really frontmost, so typed text doesn't land in the wrong window.
- **Typing.** Short ASCII text is typed key by key with `pyautogui`. Long text and anything non-ASCII (accents, emoji, other scripts) is pasted through the clipboard, because `pyautogui` can't type those characters and pasting is instant. Afterwards, the whole previous clipboard is restored through AppKit's `NSPasteboard`, so a copied image, file or piece of rich text survives, not just plain text. Before typing, the app you were in is refocused.
- **Safety.** Arguments reach AppleScript as `argv` and are never spliced into the script source, so an app name or text containing quotes can't break the script or inject into it. `pyautogui`'s fail-safe stays on: slam the mouse into a screen corner to abort typing.

### Error handling
| Situation | What you hear/see |
|---|---|
| Silence / key tapped too briefly | "I didn't hear anything." / ignored |
| Unintelligible speech | "Sorry, I didn't catch that." |
| App not installed | "I couldn't find an app called Notez. Did you mean Notes?" |
| Rate limit / quota (429), server errors (5xx), network drop | Retried up to `MAX_RETRIES` times with exponential backoff. If it still fails: "I've hit the Gemini rate limit or quota…" |
| Bad API key | "Gemini rejected the API key. Check GEMINI_API_KEY…" |
| Missing macOS permission | Checked at startup (Input Monitoring, Accessibility) and when a step fails; tells you which Privacy & Security setting to enable |
| Anything unexpected | Full traceback in the log; the loop keeps running |

## Configuration

All settings live in `.env`, and each one is documented in [`.env.example`](.env.example). The most useful ones:

| Variable | Default | |
|---|---|---|
| `GEMINI_MODEL` | `gemini-flash-latest` | Pin a specific model for stable behaviour |
| `GEMINI_THINKING_LEVEL` | *(model default)* | `low` or `minimal` gives the fastest replies |
| `STT_BACKEND` | `gemini-direct` | `gemini-direct` (one call), `gemini`, `openai`, `local`, `google` |
| `HOTKEY` / `PTT_MODE` | `alt_r` / `hold` | Any pynput key name; `toggle` for tap-to-talk |
| `TTS_VOICE` / `TTS_RATE` | system / 190 | `say -v '?'` lists voices |
| `PASTE_THRESHOLD` | 300 | Longer text is pasted instead of typed |
| `SILENCE_RMS_THRESHOLD` | 0.004 | Lower it if a quiet mic gets treated as silence |

## Troubleshooting

Start with `python -m voice_assistant --doctor`. It catches most setup problems.

- **Nothing happens when I press the hotkey.** Input Monitoring isn't granted to your terminal, or you didn't restart the terminal after granting it. Try `--toggle` or `--hotkey f8` to rule out the key itself.
- **"Only silence recorded".** Check the input device under System Settings → Sound → Input and make sure your terminal has Microphone permission. To list devices, run `python -c "import sounddevice as sd; print(sd.query_devices())"`.
- **Text isn't typed, or `osascript` errors with -1743 / -25211.** Accessibility or Automation permission is missing. Remove the terminal from the list, add it again, and restart it.
- **Wrong characters are typed.** `pyautogui` assumes a US keyboard layout. Set `PASTE_THRESHOLD=0` to always paste, which works with any layout.
- **Pressing Return sends messages in chat apps.** Multi-line text typed into Slack or Messages presses Return at each line break. Ask for single-line text there, or raise `PASTE_THRESHOLD` so the text gets pasted.
- **The Python process crashes with "trace trap" on key press.** Upgrade pynput: `pip install -U "pynput>=1.8.1"`.
- **429 errors on the free tier.** Free Gemini keys have per-minute limits. Wait, set a different `GEMINI_MODEL`, or enable billing. Keep the default `STT_BACKEND=gemini-direct` (one call per command), or use `STT_BACKEND=local` so transcription doesn't use Gemini at all.

## Extending it

To add a new intent (for example `CONTROL_MEDIA` for "pause the music"):
1. Add it to `Intent` in `ai_client.py`, and describe it with an example in `SYSTEM_PROMPT`. The schema enum is generated from `Intent`.
2. Add any payload fields it needs to `AssistantAction` and `RESPONSE_SCHEMA`.
3. Handle it in `Assistant.execute()` in `main.py`, with the macOS side in `MacController`. For example: `run_applescript('tell application "Spotify" to playpause')`.
4. Add a test in `tests/test_pipeline.py`.
