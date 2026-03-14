// domain-checker.js

async function getDomainTrustMetrics(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch (e) {
    console.error("Invalid URL provided to getDomainTrustMetrics", e);
    return {
      isHttps: false,
      isNewDomain: false,
      error: "Invalid URL"
    };
  }

  const isHttps = url.protocol === 'https:';
  const domain = url.hostname;
  
  // Basic check to prevent issues with local/internal IPs or strange formats
  if (!domain.includes('.') || domain === 'localhost') {
    return {
      isHttps,
      isNewDomain: false,
    };
  }

  let isNewDomain = false;

  try {
    // Attempt to fetch RDAP data (Registration Data Access Protocol)
    // We use a public RDAP bootstrap service or directly query a known RDAP endpoint for the TLD
    // For simplicity globally, cloudflare's 1.1.1.1 offers a DNS over HTTPS which doesn't give RDAP directly
    // Using a public RDAP API: https://rdap.org/domain/example.com
    
    const response = await fetch(`https://rdap.org/domain/${domain}`);
    
    if (response.ok) {
      const data = await response.json();
      
      // Look for the registration event
      const registrationEvent = data.events?.find(event => event.eventAction === 'registration');
      
      if (registrationEvent && registrationEvent.eventDate) {
        const registrationDate = new Date(registrationEvent.eventDate);
        const currentDate = new Date();
        
        // Calculate difference in months roughly
        const diffTime = Math.abs(currentDate - registrationDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const diffMonths = diffDays / 30; // Approx months
        
        if (diffMonths < 6) {
          isNewDomain = true;
        }
      }
    }
  } catch (error) {
    console.error(`Error querying RDAP for domain ${domain}:`, error);
    // Silent fail for RDAP as network might block it, default isNewDomain to false
  }

  return {
    isHttps,
    isNewDomain
  };
}

// Export for module systems (or make available globally in Chrome Extension)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getDomainTrustMetrics };
}
