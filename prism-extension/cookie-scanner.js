const KNOWN_COOKIES = {
  '_ga': { type: 'stalking', risk: 'high' },
  '_gid': { type: 'stalking', risk: 'high' },
  '_fbp': { type: 'stalking', risk: 'high' },
  '_gcl_au': { type: 'stalking', risk: 'high' },
  'fr': { type: 'stalking', risk: 'high' },
  'IDE': { type: 'stalking', risk: 'high' },
  'session_id': { type: 'functional', risk: 'low' },
  'PHPSESSID': { type: 'functional', risk: 'low' },
  'JSESSIONID': { type: 'functional', risk: 'low' },
  'lang': { type: 'preference', risk: 'low' },
  'theme': { type: 'preference', risk: 'low' }
};

function classifyUnknownCookie(cookieName) {
  if (/(uid|track|id|visitor|analytics|pixel|ads|uuid)/i.test(cookieName)) {
    return { type: 'stalking', risk: 'medium' };
  }
  if (/(lang|theme|pref|setting|config)/i.test(cookieName)) {
    return { type: 'preference', risk: 'low' };
  }
  return { type: 'functional', risk: 'low' };
}

async function analyzeSiteCookies() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        resolve({ categories: { stalking: 0, functional: 0, preference: 0 }, highRiskTrackers: [] });
        return;
      }
      
      const url = new URL(tabs[0].url);
      
      chrome.cookies.getAll({ domain: url.hostname }, (cookies) => {
        const categories = {
          stalking: 0,
          functional: 0,
          preference: 0
        };
        const highRiskTrackers = [];

        for (const cookie of cookies) {
          let info = KNOWN_COOKIES[cookie.name];
          if (!info) {
            info = classifyUnknownCookie(cookie.name);
          }
          
          if (categories[info.type] !== undefined) {
             categories[info.type]++;
          } else {
             categories[info.type] = 1;
          }

          if (info.risk === 'high') {
            highRiskTrackers.push(cookie.name);
          }
        }

        resolve({ categories, highRiskTrackers });
      });
    });
  });
}

function generatePrivacyLabels(analyzedData) {
  const labels = [];
  const { categories, highRiskTrackers } = analyzedData;

  // Check for the absolute best case scenario
  if (categories.stalking === 0 && categories.functional === 0 && categories.preference === 0 && highRiskTrackers.length === 0) {
    labels.push('Privacy Friendly: No trackers or cookies found.');
    return labels;
  }

  // Handle specific high-risk trackers
  if (highRiskTrackers.includes('_fbp') || highRiskTrackers.includes('fr')) {
    labels.push('This site is linking your browsing habits to your Facebook profile.');
  }

  if (highRiskTrackers.includes('_ga') || highRiskTrackers.includes('_gid') || highRiskTrackers.includes('_gcl_au')) {
    labels.push('This site is reporting your visit duration and device type back to Google.');
  }

  // Handle other high-risk stalking trackers generically if they aren't FB/Google
  const knownSpecifics = ['_fbp', 'fr', '_ga', '_gid', '_gcl_au'];
  const otherHighRisk = highRiskTrackers.filter(t => !knownSpecifics.includes(t));
  if (otherHighRisk.length > 0) {
    labels.push(`Found ${otherHighRisk.length} other high-risk tracker(s) monitoring your behavior.`);
  } else if (categories.stalking > 0 && highRiskTrackers.length === 0) {
    labels.push(`Found ${categories.stalking} tracking cookie(s) analyzing your usage.`);
  }

  // Handle functional cookies like session IDs
  if (categories.functional > 0) {
    labels.push('Essential data used to keep you logged in or maintain site functionality.');
  }

  // Handle preference cookies
  if (categories.preference > 0) {
    labels.push('Saves your site preferences (e.g., language, theme).');
  }

  // Fallback for Privacy Friendly case where no stalking/high-risk exist but some functional/preference might
  if (categories.stalking === 0 && highRiskTrackers.length === 0) {
    labels.push('Privacy Friendly: Minimal and safe data collection detected.');
  }

  return labels;
}
