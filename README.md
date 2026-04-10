## ChatGPT Optimizer (DOM Trimmer)

A minimal Chrome extension that removes old messages from ChatGPT conversations to keep the page fast and responsive.

## Purpose

Long ChatGPT conversations degrade performance because the page keeps rendering a large number of DOM nodes.

This extension improves performance by removing older messages from the page.

## Message counting

A message is any visible entry in the conversation, including user prompts and ChatGPT responses.

"Keep newest messages" refers to the total number of messages, not per role.

Example:

```
User --> ChatGPT --> User --> ChatGPT
```

This is 4 messages.

If "Keep newest messages" is set to 10, only the last 10 messages (combined) remain visible.

## Installation

This extension is not distributed via the Chrome Web Store (at least yet).

### 1. Download

- Open the repository on GitHub
- Click "Code" --> "Download ZIP"
- Extract the archive

### 2. Load in Chrome

Open:

```
chrome://extensions/
```

Enable `Developer Mode`, then click:

```
Load unpacked
```

Select the extracted folder.

## Usage

Open the extension popup and configure:

- Enabled
- Keep newest messages
- Trim threshold

Then:

- Save settings
- Click "Apply now" to run immediately

## Recommended configuration

```
Keep newest messages: 10
Trim threshold: 10
```

## Limitations

It depends on ChatGPT DOM structure (may break in the future and may require updates if the UI changes)
