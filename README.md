# PRISM - Privacy Intelligence

**PRISM** (Privacy Intelligence) is a human-centric browser extension that translates complex privacy policies and technical data into plain English. It empowers users to understand exactly how websites handle their data and helps them reclaim their privacy through proactive scanning and easy-to-use controls.

##  Key Features

###  Smart Cookie Management
*   **Plain English Descriptions**: Decodes technical cookie names (e.g., `_ga`, `fr`) into understandable categories like **"Behavior Tracker"** or **"Login / Session"**.
*   **One-Click Control**: View every cookie a site uses and revoke access instantly. Use "Turn Off All Known Cookies" for a quick privacy reset.
*   **Auto-Reject Banners**: Proactively detects and clicks "Reject All" on cookie consent banners.

 Evidence-Based Policy Analysis
*   **Deep Scanning**: Automatically detects and scans "Privacy Policy" and "Terms of Service" links.
*   **Privacy Red Flags**: Flags concerning clauses like **Data Selling**, **Location Tracking**, and **Contact Sharing**.
*   **Scraped Evidence**: PRISM shows you the **actual sentences** from the policy that triggered a warning, giving you concrete proof.

###  URL Resolution & Third-Party Detection
*   **Hover Inspection**: Resolves the final destination of links (including shorteners like bit.ly) when you hover over them.
*   **Third-Party Warning**: Explicitly flags links that lead away from the current site to protect you from unexpected redirects and hidden tracking.

### 📢 Proactive Summary Banner
*   **Automatic Insights**: A sleek, non-intrusive banner slides down on new websites to show a high-level summary of trackers and policy risks.
*   **Real-Time Protection**: Updates automatically as PRISM completes background scanning.

### 🕵️ Scam & Phishing Detection
*   **Homograph Warnings**: Detects sites using look-alike characters to impersonate trusted domains.
*   **Scam-Speech Scanning**: Analyzes page content for high-pressure scam language ("urgent", "suspended", "verify now").

## 🛠️ Technical Overview

*   **Manifest V3**: Built using the latest Chrome Extension standards.
*   **Background Service Worker**: Perpetual scanning and persistent caching for fast, reliable privacy insights.
*   **Shadow DOM Support**: Capable of detecting links and elements even inside modern, complex web components.
*   **Secure Resolution**: Uses `HEAD` requests for link resolution to follow redirect chains without downloading bulky content.

## 📥 Installation

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (top right).
4.  Click **Load unpacked** and select the `prism-extension` folder in this repository.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*PRISM: Making the invisible parts of the web visible.*
