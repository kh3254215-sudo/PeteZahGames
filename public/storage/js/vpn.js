import _CONFIG from '/config.js';
/**
 * Fetch VPN region data and set up event listeners for VPN region selection.
 *
 * @param {HTMLButtonElement} vpnToggle
 * @param {HTMLDivElement} vpnPanel
 * @param {NodeListOf<HTMLDivElement>} vpnCards
 * @returns {Promise<void>}
 */
export default async function fetchVPNRegionData(vpnToggle, vpnPanel, vpnCards) {
  const regionDataResponse = await fetch('../data/vpn.json');
  const regionData = await regionDataResponse.json();

  vpnToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    vpnPanel.classList.toggle('show');
    vpnToggle.classList.toggle('active');
  });

  document.addEventListener('click', function (e) {
    if (!vpnPanel.contains(e.target) && !vpnToggle.contains(e.target)) {
      vpnPanel.classList.remove('show');
      vpnToggle.classList.remove('active');
    }
  });

  vpnCards.forEach((card) => {
    card.addEventListener('click', function () {
      const selectedRegion = this.getAttribute('data-region');
      const data = regionData[selectedRegion];

      vpnCards.forEach((c) => c.classList.remove('selected'));
      this.classList.add('selected');

      document.getElementById('current-flag').style.backgroundImage = `url('${data.flag}')`;
      document.getElementById('current-region').textContent = data.name;

      localStorage.setItem('selectedVpnRegion', selectedRegion);

      const configScript = document.getElementById('config-script');
      if (configScript) {
        configScript.remove();
      }

      const newConfigScript = document.createElement('script');
      newConfigScript.id = 'config-script';
      newConfigScript.src = data.config;
      newConfigScript.onload = function () {
        if (typeof _CONFIG !== 'undefined') {
          _CONFIG.wispurl = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + data.wisp;
          store.wispurl = _CONFIG.wispurl;
          connection.setTransport('/epoxy/index.mjs', [{ wisp: store.wispurl }]).catch((err) => {
            console.log('Transport update:', err);
          });
        }
      };
      document.body.appendChild(newConfigScript);

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'selectedVpnRegion',
          newValue: selectedRegion,
          url: window.location.href
        })
      );

      vpnPanel.classList.remove('show');
      vpnToggle.classList.remove('active');
    });
  });

  const savedRegion = localStorage.getItem('selectedVpnRegion');
  if (savedRegion && regionData[savedRegion]) {
    const savedData = regionData[savedRegion];
    document.getElementById('current-flag').style.backgroundImage = `url('${savedData.flag}')`;
    document.getElementById('current-region').textContent = savedData.name;

    vpnCards.forEach((card) => {
      if (card.getAttribute('data-region') === savedRegion) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    const configScript = document.getElementById('config-script');
    if (configScript) {
      configScript.src = savedData.config;
    }
  }
}
