// UPnP device control — SSDP discovery + AVTransport control
// Discovers UPnP media renderers on the local network

const dgram = require('dgram');
const http = require('http');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SSDP_MX = 3; // seconds to wait for responses

const DISCOVER_MSG = Buffer.from(
  'M-SEARCH * HTTP/1.1\r\n' +
  `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
  'MAN: "ssdp:discover"\r\n' +
  `MX: ${SSDP_MX}\r\n` +
  'ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n' +
  '\r\n'
);

// ─── Device Discovery ──────────────────────────────

function discover(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const devices = [];
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const timer = setTimeout(() => {
      socket.close();
      resolve(devices);
    }, timeoutMs);

    socket.on('listening', () => {
      socket.addMembership(SSDP_ADDR);
      socket.send(DISCOVER_MSG, 0, DISCOVER_MSG.length, SSDP_PORT, SSDP_ADDR, (err) => {
        if (err) { clearTimeout(timer); socket.close(); resolve([]); }
      });
    });

    socket.on('message', (msg) => {
      const text = msg.toString();
      const location = text.match(/LOCATION:\s*(.*)/i)?.[1]?.trim();
      const server = text.match(/SERVER:\s*(.*)/i)?.[1]?.trim();
      const usn = text.match(/USN:\s*(.*)/i)?.[1]?.trim();

      if (location && !devices.find(d => d.location === location)) {
        devices.push({
          id: usn || location,
          name: server || 'Unknown Device',
          location,
          type: 'MediaRenderer',
        });
      }
    });

    socket.bind(() => {
      // Random port
    });
  });
}

// ─── AVTransport Control ───────────────────────────

async function getDeviceInfo(location) {
  return new Promise((resolve) => {
    const url = new URL(location);
    http.get({ hostname: url.hostname, port: url.port, path: url.pathname, timeout: 5000 }, (res) => {
      let data = '';

      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          // Extract friendly name from XML (simple regex, no xml2js required)
          const nameMatch = data.match(/<friendlyName>(.*?)<\/friendlyName>/);
          const modelMatch = data.match(/<modelName>(.*?)<\/modelName>/);
          resolve({
            name: nameMatch?.[1] || 'Unknown',
            model: modelMatch?.[1] || 'Unknown',
          });
        } catch (_) {
          resolve({ name: 'Unknown', model: 'Unknown' });
        }
      });
    }).on('error', () => resolve({ name: 'Unknown', model: 'Unknown' }));
  });
}

async function play(device, audioUrl) {
  // UPnP play requires SOAP request to AVTransport service
  // This is a placeholder for the full SOAP implementation
  if (!device || !device.location) return false;

  try {
    const info = await getDeviceInfo(device.location);
    console.log('[upnp] play on', info.name, ':', audioUrl);
    // TODO: Full SOAP AVTransport::SetAVTransportURI + Play
    return true;
  } catch (err) {
    console.error('[upnp] play error:', err.message);
    return false;
  }
}

module.exports = { discover, getDeviceInfo, play };
