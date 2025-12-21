'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var path = require('path');
var express = require('express');
var http = require('http');
var WebSocket = require('ws');
var { execSync } = require('child_process');
var multer = require('multer');

module.exports = SpectrumWeb;

/* ──────────────────────────────────────────────── *
 *  Constructor
 * ──────────────────────────────────────────────── */
function SpectrumWeb(context) {
  var self = this;

  self.context = context;
  self.commandRouter = context.coreCommand;
  self.logger = self.commandRouter.logger;

  self.app = null;
  self.httpServer = null;
  self.wss = null;
  self.fifoStream = null;
  self._fifoWatcher = null;

  // File paths
  self.uiConfigFile = path.join(__dirname, 'UIConfig.json');
  self.settingsFile = path.join(__dirname, 'settings.json');
}

/* ──────────────────────────────────────────────── *
 *  UIConfig.json Utilities
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.loadUIConfig = function () {
  var self = this;
  try {
    return fs.readJsonSync(self.uiConfigFile);
  } catch (e) {
    self.logger.error('[SpectrumWeb] Error loading UIConfig.json:', e.message);
    return null;
  }
};

SpectrumWeb.prototype.saveUIConfig = function (uiconf) {
  var self = this;
  try {
    fs.writeJsonSync(self.uiConfigFile, uiconf, { spaces: 2 });
    self.logger.info('[SpectrumWeb] UIConfig.json saved');
    return true;
  } catch (e) {
    self.logger.error('[SpectrumWeb] Error saving UIConfig.json:', e.message);
    return false;
  }
};

/* ──────────────────────────────────────────────── *
 *  Extract settings from UIConfig.json analyzer section
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.extractSettingsFromUIConfig = function () {
  var self = this;
  var uiconf = self.loadUIConfig();

  if (!uiconf) return {};

  var analyzerSection = uiconf.sections.find(function (s) {
    return s.id === 'analyzer';
  });

  if (!analyzerSection) {
    self.logger.warn('[SpectrumWeb] Analyzer section not found in UIConfig.json');
    return {};
  }

  var settings = {};

  analyzerSection.content.forEach(function (item) {
    // Skip headers
    if (item.element === 'section') return;

    var value = item.value;

    // Extract value from select objects
    if (item.element === 'select' && value && typeof value === 'object') {
      value = value.value;
    }

    settings[item.id] = value;
  });

  self.logger.info('[SpectrumWeb] Extracted ' + Object.keys(settings).length + ' settings from UIConfig.json');
  return settings;
};

/* ──────────────────────────────────────────────── *
 *  Update UIConfig.json with new values
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.updateUIConfigValues = function (data) {
  var self = this;
  var uiconf = self.loadUIConfig();

  if (!uiconf) return false;

  var analyzerSection = uiconf.sections.find(function (s) {
    return s.id === 'analyzer';
  });

  if (!analyzerSection) return false;

  var updated = 0;

  for (var key in data) {
    if (data.hasOwnProperty(key)) {
      var item = analyzerSection.content.find(function (c) {
        return c.id === key;
      });

      if (item && item.element !== 'section') {
        var value = data[key];

        // Handle select dropdowns
        if (item.element === 'select') {
          // If value is already an object, use it
          if (value && typeof value === 'object' && value.value !== undefined) {
            item.value = value;
          } else {
            // Find matching option
            var option = item.options.find(function (o) {
              return String(o.value) === String(value);
            });
            if (option) {
              item.value = option;
            } else {
              continue;
            }
          }
        } else {
          item.value = value;
        }

        updated++;
      }
    }
  }

  if (updated > 0) {
    self.saveUIConfig(uiconf);
    return true;
  }

  return false;
};

/* ──────────────────────────────────────────────── *
 *  Sync settings.json from UIConfig.json
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.syncSettingsFromUIConfig = function () {
  var self = this;

  var settings = self.extractSettingsFromUIConfig();

  try {
    fs.writeJsonSync(self.settingsFile, settings, { spaces: 2 });
    self.logger.info('[SpectrumWeb] settings.json synced from UIConfig.json');
    return true;
  } catch (e) {
    self.logger.error('[SpectrumWeb] Error syncing settings.json:', e.message);
    return false;
  }
};

/* ──────────────────────────────────────────────── *
 *  Load settings from settings.json (for client API)
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.loadSettings = function () {
  var self = this;
  try {
    if (fs.existsSync(self.settingsFile)) {
      return fs.readJsonSync(self.settingsFile);
    } else {
      // If settings.json doesn't exist, extract from UIConfig.json
      self.logger.info('[SpectrumWeb] settings.json not found, extracting from UIConfig.json');
      var settings = self.extractSettingsFromUIConfig();
      fs.writeJsonSync(self.settingsFile, settings, { spaces: 2 });
      return settings;
    }
  } catch (e) {
    self.logger.error('[SpectrumWeb] Error loading settings:', e.message);
    return {};
  }
};

/* ──────────────────────────────────────────────── *
 *  Volumio Lifecycle
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.onVolumioStart = function () {
  var self = this;
  var configFile = self.commandRouter.pluginManager.getConfigurationFile(self.context, 'config.json');

  self.logger.info('[SpectrumWeb] Loading config from: ' + configFile);
  self.logger.info('[SpectrumWeb] (Plugin template: ' + path.join(__dirname, 'config.json') + ')');

  self.config = new (require('v-conf'))();
  self.config.loadFile(configFile);

  // Set default values only if they don't exist (to preserve user settings)
  if (self.config.get('appPort') === undefined) {
    self.config.set('appPort', 8090);
  }
  if (self.config.get('wsPort') === undefined) {
    self.config.set('wsPort', 9001);
  }
  if (self.config.get('fifoPath') === undefined) {
    self.config.set('fifoPath', '/tmp/mpd.fifo');
  }
  if (self.config.get('kioskEnabled') === undefined) {
    self.config.set('kioskEnabled', false);
  }
  if (self.config.get('kioskUrl') === undefined) {
    var appPort = self.config.get('appPort') || 8090;
    self.config.set('kioskUrl', 'http://localhost:' + appPort);
  }


  // Ensure settings.json is synced from UIConfig.json
  if (!fs.existsSync(self.settingsFile)) {
    self.logger.info('[SpectrumWeb] Creating settings.json from UIConfig.json');
    self.syncSettingsFromUIConfig();
  }

  return libQ.resolve();
};

SpectrumWeb.prototype.onStart = function () {
  var self = this;
  var defer = libQ.defer();

  var appPort = self.config.get('appPort') || 8090;
  var wsPort = self.config.get('wsPort') || 9001;
  var fifoPath = self.config.get('fifoPath') || '/tmp/mpd.fifo';

  self.logger.info('[SpectrumWeb] Starting - HTTP:' + appPort + ', WS:' + wsPort);

  self.cleanupServers()
    .then(function () {
      return self.addMpdFifoConfig();
    })
    .then(function () {
      return self.initExpress(appPort);
    })
    .then(function () {
      return self.initWebSocket(wsPort);
    })
    .then(function () {
      return self.initFifoStream(fifoPath);
    })
    .then(function () {
      self.logger.info('[SpectrumWeb] Started successfully');
      defer.resolve();
    })
    .fail(function (err) {
      self.logger.error('[SpectrumWeb] Start error:', err);
      defer.reject(err);
    });

  return defer.promise;
};

SpectrumWeb.prototype.onStop = function () {
  var self = this;
  var defer = libQ.defer();

  self.logger.info('[SpectrumWeb] Stopping...');

  self.cleanupServers()
    .then(function () {
      return self.removeMpdFifoConfig();
    })
    .then(function () {
      self.logger.info('[SpectrumWeb] Stopped');
      defer.resolve();
    })
    .fail(function (err) {
      self.logger.error('[SpectrumWeb] Stop error:', err);
      defer.reject(err);
    });

  return defer.promise;
};

/* ──────────────────────────────────────────────── *
 *  Get UI Configuration
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.getUIConfig = function () {
  var self = this;
  var defer = libQ.defer();

  var lang_code = self.commandRouter.sharedVars.get('language_code');

  self.commandRouter.i18nJson(
    __dirname + '/i18n/strings_' + lang_code + '.json',
    __dirname + '/i18n/strings_en.json',
    __dirname + '/UIConfig.json'
  )
    .then(function (uiconf) {
      // Load current UIConfig.json to get saved values
      var savedUIConfig = self.loadUIConfig();

      if (savedUIConfig) {
        // Find sections and merge saved values
        uiconf.sections.forEach(function (section, sectionIndex) {
          var savedSection = savedUIConfig.sections.find(function (s) {
            return s.id === section.id;
          });

          if (savedSection) {
            section.content.forEach(function (item, itemIndex) {
              var savedItem = savedSection.content.find(function (c) {
                return c.id === item.id;
              });

              if (savedItem && savedItem.value !== undefined) {
                var destItem = uiconf.sections[sectionIndex].content[itemIndex];
                var loadedVal = savedItem.value;
                // If destination is not a select and saved value is an object wrapper, unwrap it
                if (destItem && destItem.element !== 'select' && typeof loadedVal === 'object' && loadedVal.value !== undefined) {
                  loadedVal = loadedVal.value;
                }
                uiconf.sections[sectionIndex].content[itemIndex].value = loadedVal;
              }
            });
          }
        });
      }

      // Update general section with config.json values
      var generalSection = uiconf.sections.find(function (s) { return s.id === 'general'; });
      if (generalSection) {
        generalSection.content.forEach(function (item) {
          if (item.id === 'appPort') {
            item.value = self.config.get('appPort') || 8090;
          } else if (item.id === 'wsPort') {
            item.value = self.config.get('wsPort') || 9001;
          } else if (item.id === 'fifoPath') {
            item.value = self.config.get('fifoPath') || '/tmp/mpd.fifo';
          } else if (item.id === 'kioskEnabled') {
            item.value = self.config.get('kioskEnabled') || false;
          } else if (item.id === 'kioskUrl') {
            item.value = self.config.get('kioskUrl') || 'http://localhost:8090';
          }
        });
      }

      // Sanitize values: ensure non-select inputs have primitive values
      try {
        uiconf.sections.forEach(function (section) {
          if (!section.content) return;
          section.content.forEach(function (item) {
            if (!item || item.value === undefined) return;
            // For non-select elements, if value is an object wrapper {value,label}, unwrap it
            if (item.element !== 'select' && typeof item.value === 'object' && item.value !== null && item.value.value !== undefined) {
              item.value = item.value.value;
            }
          });
        });
      } catch (e) {
        self.logger.warn('[SpectrumWeb] UI config sanitization failed:', e.message);
      }

      defer.resolve(uiconf);
    })
    .fail(function (e) {
      self.logger.error('[SpectrumWeb] getUIConfig failed:', e);
      defer.reject(new Error());
    });

  return defer.promise;
};

/* ──────────────────────────────────────────────── *
 *  Save General Config
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.saveGeneralConfig = function (data) {
  var self = this;
  var defer = libQ.defer();

  self.logger.info('[SpectrumWeb] Saving general config to: ' + self.commandRouter.pluginManager.getConfigurationFile(self.context, 'config.json'));

  try {
    // Parse and normalize boolean for kioskEnabled first
    var kioskEnabled = false;
    if (data.kioskEnabled !== undefined) {
      if (typeof data.kioskEnabled === 'boolean') {
        kioskEnabled = data.kioskEnabled;
      } else if (typeof data.kioskEnabled === 'string') {
        kioskEnabled = data.kioskEnabled.toLowerCase() === 'true';
      } else if (typeof data.kioskEnabled === 'number') {
        kioskEnabled = data.kioskEnabled !== 0;
      } else {
        kioskEnabled = Boolean(data.kioskEnabled);
      }
    } else {
      kioskEnabled = self.config.get('kioskEnabled') || false;
    }

    // Save to config.json (maintain existing flat structure)
    if (data.appPort !== undefined) {
      var port = parseInt(data.appPort);
      self.config.set('appPort', port);
    }

    if (data.wsPort !== undefined) {
      var wsport = parseInt(data.wsPort);
      self.config.set('wsPort', wsport);
    }

    if (data.fifoPath !== undefined) {
      self.config.set('fifoPath', String(data.fifoPath));
    }

    self.config.set('kioskEnabled', kioskEnabled);

    if (data.kioskUrl !== undefined) {
      self.config.set('kioskUrl', String(data.kioskUrl));
    }

    // Save config to disk
    self.config.save();
    self.logger.info('[SpectrumWeb] Config saved - kioskEnabled: ' + kioskEnabled);

    // Update UIConfig.json
    var uiconf = self.loadUIConfig();
    if (uiconf) {
      var generalSection = uiconf.sections.find(function (s) { return s.id === 'general'; });
      if (generalSection) {
        generalSection.content.forEach(function (item) {
          if (data[item.id] !== undefined) {
            var newVal = data[item.id];
            
            // Handle kioskEnabled with the normalized value
            if (item.id === 'kioskEnabled') {
              newVal = kioskEnabled;
            } else {
              // For non-boolean fields, unwrap object values if needed
              if (typeof newVal === 'object' && newVal !== null && newVal.value !== undefined) {
                newVal = newVal.value;
              }
            }
            
            item.value = newVal;
          }
        });
        self.saveUIConfig(uiconf);
      }
    }

    // Apply kiosk mode changes
    if (kioskEnabled) {
      var appPort = self.config.get('appPort') || 8090;
      var kioskUrl = data.kioskUrl || self.config.get('kioskUrl') || ('http://localhost:' + appPort);
      self.enableKioskMode(kioskUrl);
    } else {
      self.disableKioskMode();
    }

    self.commandRouter.pushToastMessage(
      'success',
      'Spectrum Web',
      'General settings saved'
    );

    defer.resolve();
  } catch (err) {
    self.logger.error('[SpectrumWeb] Save general config error:', err);
    self.commandRouter.pushToastMessage('error', 'Spectrum Web', 'Error: ' + err.message);
    defer.reject(err);
  }

  return defer.promise;
};

/* ──────────────────────────────────────────────── *
 *  Save Analyzer Config
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.saveAnalyzerConfig = function (data) {
  var self = this;
  var defer = libQ.defer();

  self.logger.info('[SpectrumWeb] Saving analyzer config...');

  try {
    // Step 1: Update UIConfig.json with new values
    var updated = self.updateUIConfigValues(data);

    if (!updated) {
      throw new Error('Failed to update UIConfig.json');
    }

    // Step 2: Extract all settings from UIConfig.json and save to settings.json
    var success = self.syncSettingsFromUIConfig();

    if (!success) {
      throw new Error('Failed to sync settings.json');
    }

    // Step 3: Broadcast to WebSocket clients
    self.broadcastSettingsUpdate();

    self.commandRouter.pushToastMessage(
      'success',
      'Spectrum Web',
      'Analyzer settings saved and synced'
    );

    defer.resolve();

  } catch (err) {
    self.logger.error('[SpectrumWeb] Save analyzer config error:', err);
    self.commandRouter.pushToastMessage('error', 'Spectrum Web', 'Error: ' + err.message);
    defer.reject(err);
  }

  return defer.promise;
};

/* ──────────────────────────────────────────────── *
 *  Broadcast Settings Update
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.broadcastSettingsUpdate = function () {
  var self = this;

  if (!self.wss) {
    self.logger.warn('[SpectrumWeb] WebSocket not available for broadcast');
    return;
  }

  try {
    var settings = self.loadSettings();
    var message = JSON.stringify({
      type: 'settings',
      data: settings
    });

    var count = 0;
    self.wss.clients.forEach(function (client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        count++;
      }
    });

    self.logger.info('[SpectrumWeb] Settings broadcasted to ' + count + ' client(s)');
  } catch (err) {
    self.logger.error('[SpectrumWeb] Broadcast error:', err);
  }
};

/* ──────────────────────────────────────────────── *
 *  MPD FIFO Configuration
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.addMpdFifoConfig = function () {
  var self = this;
  var defer = libQ.defer();
  var file = '/etc/mpd.conf';

  try {
    if (!fs.existsSync(file)) {
      defer.resolve();
      return defer.promise;
    }

    var content = fs.readFileSync(file, 'utf8');
    if (content.includes('# SpectrumWeb FIFO')) {
      self.logger.info('[SpectrumWeb] FIFO already configured');
      defer.resolve();
      return defer.promise;
    }

    var appendText = '\n# SpectrumWeb FIFO\n' +
      'audio_output {\n' +
      '    type "fifo"\n' +
      '    name "spectrum_visualizer"\n' +
      '    path "/tmp/mpd.fifo"\n' +
      '    format "44100:16:2"\n' +
      '    always_on "yes"\n' +
      '}\n' +
      '# End SpectrumWeb FIFO\n';

    // var appendText = '\n# SpectrumWeb FIFO\n' +
    //   'audio_output {\n' +
    //   '    type "fifo"\n' +
    //   '    name "spectrum_visualizer"\n' +
    //   '    path "/tmp/mpd.fifo"\n' +
    //   '    format "44100:16:2"\n' +
    //   '    always_on "yes"\n' +
    //   '}\n' +
    //   'audio_output {\n' +
    //   '   type            "httpd"\n' +
    //   '   name            "localhost"\n' +
    //   '   encoder         "lame"\n' +
    //   '   port            "8001"\n' +
    //   '   bitrate         "320"\n' +
    //   '   format          "44100:16:2"\n' +
    //   '   max_clients     "5" \n' +
    //   '   buffer_time     "5000"\n' +
    //   '   outburst_time   "2000"\n' +
    //   '   always_on "yes"\n' +
    //   '   tags "yes"\n' +
    //   '   }\n' +
    //   '# End SpectrumWeb FIFO\n';

  fs.appendFileSync(file, appendText);
  execSync('sudo systemctl restart mpd');

  self.logger.info('[SpectrumWeb] FIFO configured');
  defer.resolve();

} catch (e) {
  self.logger.error('[SpectrumWeb] Add FIFO error:', e.message);
  defer.reject(e);
}

return defer.promise;
};

SpectrumWeb.prototype.removeMpdFifoConfig = function () {
  var self = this;
  var defer = libQ.defer();
  var file = '/etc/mpd.conf';

  try {
    if (!fs.existsSync(file)) {
      defer.resolve();
      return defer.promise;
    }

    var content = fs.readFileSync(file, 'utf8');
    var start = content.indexOf('# SpectrumWeb FIFO');
    var end = content.indexOf('# End SpectrumWeb FIFO');

    if (start !== -1 && end !== -1) {
      var updated = content.substring(0, start) + content.substring(end + 23);
      fs.writeFileSync(file, updated);
      execSync('sudo systemctl restart mpd');
      self.logger.info('[SpectrumWeb] FIFO removed');
    }

    defer.resolve();
  } catch (e) {
    self.logger.error('[SpectrumWeb] Remove FIFO error:', e.message);
    defer.reject(e);
  }

  return defer.promise;
};

/* ──────────────────────────────────────────────── *
 *  Kiosk Mode Management
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.enableKioskMode = function (url) {
  var self = this;

  try {
    var appPort = self.config.get('appPort') || 8090;
    url = url || self.config.get('kioskUrl') || ('http://localhost:' + appPort);

    self.logger.info('[SpectrumWeb] Enabling kiosk mode with URL: ' + url);

    // Update kiosk.sh with the correct URL
    var kioskShPath = path.join(__dirname, 'kiosk.sh');
    if (fs.existsSync(kioskShPath)) {
      try {
        var kioskContent = fs.readFileSync(kioskShPath, 'utf8');
        // Replace the URL in the last line (http://localhost:XXXX)
        var updatedContent = kioskContent.replace(
          /http:\/\/localhost:\d+\s*$/m,
          url + '\n'
        );
        fs.writeFileSync(kioskShPath, updatedContent);
        self.logger.info('[SpectrumWeb] Updated kiosk.sh with URL: ' + url);
      } catch (err) {
        self.logger.error('[SpectrumWeb] Failed to update kiosk.sh:', err.message);
      }
    }

    // Enable and start the service (should already exist from install.sh)
    execSync('sudo systemctl enable spectrum-kiosk.service');
    execSync('sudo systemctl restart spectrum-kiosk.service');

    self.logger.info('[SpectrumWeb] Kiosk mode enabled');

    self.commandRouter.pushToastMessage(
      'success',
      'Spectrum Web',
      'Kiosk mode enabled. Display will show spectrum in fullscreen.'
    );

  } catch (err) {
    self.logger.error('[SpectrumWeb] Enable kiosk error:', err);
    self.commandRouter.pushToastMessage(
      'error',
      'Spectrum Web',
      'Failed to enable kiosk mode: ' + err.message
    );
  }
};

SpectrumWeb.prototype.disableKioskMode = function () {
  var self = this;

  try {
    self.logger.info('[SpectrumWeb] Disabling kiosk mode');

    // Stop and disable the service
    try {
      execSync('sudo systemctl stop spectrum-kiosk.service');
    } catch (e) {
      // Service might not be running
    }

    try {
      execSync('sudo systemctl disable spectrum-kiosk.service');
    } catch (e) {
      // Service might not be enabled
    }

    self.logger.info('[SpectrumWeb] Kiosk mode disabled');

    self.commandRouter.pushToastMessage(
      'success',
      'Spectrum Web',
      'Kiosk mode disabled'
    );

  } catch (err) {
    self.logger.error('[SpectrumWeb] Disable kiosk error:', err);
  }
};

SpectrumWeb.prototype.getKioskStatus = function () {
  var self = this;

  try {
    var isRunning = false;
    try {
      execSync('systemctl is-active spectrum-kiosk.service');
      isRunning = true;
    } catch (e) {
      isRunning = false;
    }

    var appPort = self.config.get('appPort') || 8090;
    return {
      enabled: self.config.get('kioskEnabled') || false,
      url: self.config.get('kioskUrl') || ('http://localhost:' + appPort),
      running: isRunning
    };
  } catch (err) {
    self.logger.error('[SpectrumWeb] Get kiosk status error:', err);
    var appPort = self.config.get('appPort') || 8090;
    return {
      enabled: false,
      url: 'http://localhost:' + appPort,
      running: false
    };
  }
};

/* ──────────────────────────────────────────────── *
 *  Cleanup Servers
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.cleanupServers = function () {
  var self = this;
  var defer = libQ.defer();

  var closeServer = function (server) {
    return new Promise(function (resolve) {
      if (!server) {
        resolve();
        return;
      }
      try {
        server.close(function () { resolve(); });
        setTimeout(resolve, 1000);
      } catch (e) {
        resolve();
      }
    });
  };

  Promise.resolve()
    .then(function () {
      if (self.wss) {
        self.wss.clients.forEach(function (client) {
          try { client.terminate(); } catch (e) { }
        });
        return closeServer(self.wss);
      }
    })
    .then(function () {
      self.wss = null;
      return closeServer(self.httpServer);
    })
    .then(function () {
      self.httpServer = null;
      if (self.fifoStream) {
        try { self.fifoStream.destroy(); } catch (e) { }
        self.fifoStream = null;
      }
      if (self._fifoWatcher) {
        try { self._fifoWatcher.close(); } catch (e) { }
        self._fifoWatcher = null;
      }
      setTimeout(function () { defer.resolve(); }, 300);
    })
    .catch(function (err) {
      self.logger.error('[SpectrumWeb] Cleanup error:', err);
      defer.resolve();
    });

  return defer.promise;
};

/* ──────────────────────────────────────────────── *
 *  Initialize Express
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.initExpress = function (port) {
  var self = this;
  var defer = libQ.defer();

  try {
    var uiDir = path.join(__dirname, 'ui');
    fs.ensureDirSync(uiDir);

    self.app = express();
    self.app.use(express.json());

    // CORS
    self.app.use(function (req, res, next) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
    // API endpoint to list background files
    const backgroundsDir = path.join(uiDir, 'backgrounds');
    self.app.get('/api/backgrounds', (req, res) => {
      try {
        const result = { images: [], videos: [] };
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
        const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov'];

        if (!fs.existsSync(backgroundsDir)) {
          return res.json(result);
        }

        const files = fs.readdirSync(backgroundsDir);

        files.forEach(file => {
          const ext = path.extname(file).toLowerCase().slice(1);
          const fullPath = path.join(backgroundsDir, file);
          const stats = fs.statSync(fullPath);

          if (!stats.isFile()) return;

          if (imageExts.includes(ext)) {
            result.images.push(file);
          } else if (videoExts.includes(ext)) {
            result.videos.push(file);
          }
        });

        self.logger.info(`[SpectrumWeb] Background files: ${result.images.length} images, ${result.videos.length} videos`);
        res.json(result);
      } catch (e) {
        self.logger.error('[SpectrumWeb] Error listing backgrounds:', e.message);
        res.status(500).json({ error: e.message });
      }
    });

    // API endpoint to upload background files
    fs.ensureDirSync(backgroundsDir);

    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, backgroundsDir);
      },
      filename: function (req, file, cb) {
        // Keep original filename
        cb(null, file.originalname);
      }
    });

    const fileFilter = function (req, file, cb) {
      const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'mkv', 'avi', 'mov'];
      const ext = path.extname(file.originalname).toLowerCase().slice(1);

      if (allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only images and videos allowed.'));
      }
    };

    const upload = multer({
      storage: storage,
      fileFilter: fileFilter,
      limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
    });

    self.app.post('/api/backgrounds', upload.single('file'), (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov'];
        const ext = path.extname(req.file.filename).toLowerCase().slice(1);

        let fileType = 'unknown';
        if (imageExts.includes(ext)) {
          fileType = 'image';
        } else if (videoExts.includes(ext)) {
          fileType = 'video';
        }

        self.logger.info(`[SpectrumWeb] Background file uploaded: ${req.file.filename} (${fileType})`);

        res.json({
          success: true,
          filename: req.file.filename,
          type: fileType,
          size: req.file.size,
          message: 'File uploaded successfully'
        });
      } catch (e) {
        self.logger.error('[SpectrumWeb] Error uploading background:', e.message);
        res.status(500).json({ error: e.message });
      }
    });

    // API: Get settings (from settings.json)
    self.app.get('/api/settings', function (req, res) {
      try {
        var settings = self.loadSettings();
        res.json(settings);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Update settings (saves to UIConfig.json → settings.json)
    self.app.post('/api/settings', function (req, res) {
      try {
        // Update UIConfig.json
        var updated = self.updateUIConfigValues(req.body || {});

        if (updated) {
          // Sync to settings.json
          self.syncSettingsFromUIConfig();

          // Broadcast to clients
          self.broadcastSettingsUpdate();

          res.json({ success: true });
        } else {
          res.status(500).json({ error: 'Failed to update settings' });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Get kiosk status
    self.app.get('/api/kiosk/status', function (req, res) {
      try {
        var status = self.getKioskStatus();
        res.json(status);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Enable kiosk mode
    self.app.post('/api/kiosk/enable', function (req, res) {
      try {
        var appPort = self.config.get('appPort') || 8090;
        var url = req.body.url || self.config.get('kioskUrl') || ('http://localhost:' + appPort);
        self.enableKioskMode(url);
        res.json({ success: true, message: 'Kiosk mode enabled' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Disable kiosk mode
    self.app.post('/api/kiosk/disable', function (req, res) {
      try {
        self.disableKioskMode();
        res.json({ success: true, message: 'Kiosk mode disabled' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    self.app.use(express.static(uiDir));

    self.httpServer = http.createServer(self.app);

    self.httpServer.on('error', function (err) {
      self.logger.error('[SpectrumWeb] HTTP error:', err);
      defer.reject(err);
    });

    self.httpServer.listen(port, '0.0.0.0', function () {
      self.logger.info('[SpectrumWeb] HTTP listening on port ' + port);
      self.logger.info('[SpectrumWeb] Settings API: GET/POST http://volumio.local:' + port + '/api/settings');
      defer.resolve();
    });

  } catch (err) {
    self.logger.error('[SpectrumWeb] initExpress error:', err);
    defer.reject(err);
  }

  return defer.promise;
};

/* ──────────────────────────────────────────────── *
 *  Initialize WebSocket
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.initWebSocket = function (port) {
  var self = this;
  var defer = libQ.defer();

  try {
    self.wss = new WebSocket.Server({ port: port });

    self.wss.on('connection', function (ws) {
      self.logger.info('[SpectrumWeb] WebSocket client connected');

      // Send format
      ws.send(JSON.stringify({
        type: 'format',
        sampleRate: 44100,
        channels: 2,
        bitsPerSample: 16
      }));

      // Send settings preset from settings.json
      try {
        var settings = self.loadSettings();
        ws.send(JSON.stringify({
          type: 'settings',
          data: settings
        }));
        self.logger.info('[SpectrumWeb] Settings preset sent to client');
      } catch (err) {
        self.logger.error('[SpectrumWeb] Error sending settings:', err);
      }
    });

    self.wss.on('listening', function () {
      self.logger.info('[SpectrumWeb] WebSocket listening on port ' + port);
      defer.resolve();
    });

    self.wss.on('error', function (err) {
      self.logger.error('[SpectrumWeb] WebSocket error:', err);
      defer.reject(err);
    });

  } catch (err) {
    self.logger.error('[SpectrumWeb] initWebSocket error:', err);
    defer.reject(err);
  }

  return defer.promise;
};

/* ──────────────────────────────────────────────── *
 *  Initialize FIFO Stream
 * ──────────────────────────────────────────────── */
SpectrumWeb.prototype.initFifoStream = function (fifoPath) {
  var self = this;
  var defer = libQ.defer();

  var broadcast = function (buffer) {
    if (!self.wss) return;
    self.wss.clients.forEach(function (client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(buffer);
      }
    });
  };

  var startStream = function () {
    if (self.fifoStream || !fs.existsSync(fifoPath)) return;

    try {
      self.fifoStream = fs.createReadStream(fifoPath);

      self.fifoStream.on('data', function (chunk) {
        broadcast(chunk);
      });

      self.fifoStream.on('end', function () {
        restartStream('end');
      });

      self.fifoStream.on('error', function (err) {
        restartStream('error', err.message);
      });

      self.logger.info('[SpectrumWeb] FIFO stream opened');
    } catch (err) {
      self.logger.error('[SpectrumWeb] FIFO stream error:', err);
    }
  };

  var restartStream = function (reason, msg) {
    self.logger.warn('[SpectrumWeb] FIFO ' + reason + ' - restarting...', msg || '');
    try {
      if (self.fifoStream) self.fifoStream.destroy();
    } catch (e) { }
    self.fifoStream = null;
    setTimeout(startStream, 2000);
  };

  startStream();

  var dir = path.dirname(fifoPath);
  try {
    self._fifoWatcher = fs.watch(dir, function (event, filename) {
      if (filename === path.basename(fifoPath) && fs.existsSync(fifoPath)) {
        startStream();
      }
    });
  } catch (err) {
    self.logger.error('[SpectrumWeb] Watch error:', err);
  }

  defer.resolve();
  return defer.promise;
};
