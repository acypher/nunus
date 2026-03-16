/**
 * Content script entry point - selects site handler and runs Nunus.
 */
(function() {
  const host = window.location.hostname;
  let site = null;

  if (host.includes('nytimes.com')) {
    site = window.NunusSites?.nyt;
  } else if (host.includes('washingtonpost.com')) {
    site = window.NunusSites?.washingtonpost;
  } else if (host.includes('theguardian.com') || host.includes('guardian.co.uk')) {
    site = window.NunusSites?.guardian;
  }

  if (site && typeof window.NunusRun === 'function') {
    window.NunusRun(site);
  }
})();
