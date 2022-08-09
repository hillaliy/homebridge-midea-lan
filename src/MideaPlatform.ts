import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { MideaAccessory } from './MideaAccessory';

const { py, python } = require('pythonia');

export class MideaPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  mideaAccessories: MideaAccessory[] = [];

  devices: any;
  midea_beautiful: any;
  cloud: any;
  updateInterval: any = null;
  appCredentials: any;
  appliances: any;
  refreshTimeout: any = null;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
    // public readonly option: Options
  ) {
    // super({
    //   ...Options,
    //   name: "midea",
    // });
    this.log.debug('Finished initializing platform:', this.config.name);
    this.log = log;
    this.config = config;

    this.appCredentials = {
      nethome: {
        appkey: "3742e9e5842d4ad59c2db887e12449f9",
        appid: 1017,
        api_url: "https://mapp.appsmb.com",
        sign_key: "xhdiwjnchekd4d512chdjx5d8e4c394D2D7S",
        proxied: null,
      },
      midea: {
        appkey: "ff0cf6f5f0c3471de36341cab3f7a9af",
        appid: 1117,
        api_url: "https://mapp.appsmb.com",
        sign_key: "xhdiwjnchekd4d512chdjx5d8e4c394D2D7S",
        proxied: null,
      },
      msmarthome: {
        appkey: "ac21b9f9cbfe4ca5a88562ef25e2b768",
        appid: 1010,
        api_url: "https://mp-prod.appsmb.com/mas/v5/app/proxy?alias=",
        sign_key: "xhdiwjnchekd4d512chdjx5d8e4c394D2D7S",
        iotkey: "meicloud",
        hmackey: "PROD_VnoClJI9aikS8dyy",
        proxied: "v5",
      },
    };
    api.on('didFinishLaunching', () => {
      this.onReady();
      // this.onUnload();
      // this.on('ready', this.onReady.bind(this));
      // this.on("stateChange", this.onStateChange.bind(this));
      // this.on('unload', this.onUnload.bind(this));
      // this.json2iob = new Json2iob(this);
      this.log.debug('Executed didFinishLaunching callback');
      // this.devices = {};
    });
  }

  // Is called when databases are connected and adapter received configuration.
  async onReady() {
    try {
      this.midea_beautiful = await python('midea_beautiful');
      this.log.debug('Load "midea_beautiful" successful');
      this.cloud = await this.login();
      try {
        await this.getDeviceList();
        await this.updateDevices();
      } catch (error) {
        this.log.debug('getDeviceList failed');
      }
      this.updateInterval = setInterval(() => {
        this.updateDevices();
      }, this.config['interval'] * 60 * 1000);
    } catch (error) {
      this.log.debug('Load "midea_beautiful" failed');
    }

    // this.setState("info.connection", false, true);
    // if (this.config.interval < 0.5) {
    //   this.log.info("Set interval to minimum 0.5");
    //   this.config.interval = 0.5;
    // }
    // if (!this.config.user || !this.config.password) {
    //   this.log.error(
    //     "Please set username and password in the instance settings"
    //   );
    //   return;
    // }

    // Reset the connection indicator during startup
    // this.setState("info.connection", false, true);

    // in this template all states changes inside the adapters namespace are subscribed
    // this.subscribeStates("*");
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(`Loading accessory from cache: ${accessory.displayName}`);
    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async login() {
    try {
      const cloud = await this.midea_beautiful.connect_to_cloud$({
        account: this.config['user'],
        password: this.config['password'],
        ...this.appCredentials.msmarthome, //[this.config.supportedApps],
      });
      this.log.debug(await cloud.__dict__);
      this.log.info('Login successful');
      // this.setState("info.connection", true, true);
      return cloud;
    } catch (error: any) {
      this.log.error(error);
    }
  }

  async getDeviceList() {
    try {
      this.log.info('Getting devices');
      this.appliances = await this.midea_beautiful.find_appliances$({
        cloud: this.cloud,
      });
      this.log.debug(`Found ${await this.appliances.length} devices`);
      // this.log.debug(this.appliances);
      // this.log.info(this.appliances[0]);

      for await (const [index, app] of await py.enumerate(this.appliances)) {
        this.log.debug(await app);
        const appJsonString = this.pythonToJson(
          await app.state.__dict__.__str__(),
        );
        const appJson = JSON.parse(appJsonString);
        this.log.debug(appJson);
        const id = appJson.id;
        this.devices[id] = appJson;

        for (const device of this.devices) {
          const uuid = this.api.hap.uuid.generate(device.UniqueId);
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

          if (existingAccessory) {
            this.log.debug(`Restoring existing accessory from cache: ${existingAccessory.displayName}`);
            existingAccessory.context.deviceId = device.id;
            existingAccessory.context.name = device.displayName;
            this.api.updatePlatformAccessories([existingAccessory]);

            const ma = new MideaAccessory(this, existingAccessory, device.id, parseInt(device.type), device.displayName, device.userId);
            this.mideaAccessories.push(ma);

            this.configureAccessory(existingAccessory);
          } else {
            this.log.debug(`Adding new device: ${device.displayName}`);
            const accessory = new this.api.platformAccessory(device.displayName, uuid);
            accessory.context.deviceId = device.id;
            accessory.context.name = device.displayName;

            const ma = new MideaAccessory(this, accessory, device.id, parseInt(device.type), device.displayName, device.userId);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            this.mideaAccessories.push(ma);

            this.configureAccessory(accessory);
          }
        }

        // this.setObjectNotExistsAsync(id, {
        //   type: 'device',
        //   common: {
        //     name: appJson.name,
        //   },
        //   native: {},
        // });
        // this.json2iob.parse(id, appJson, { write: true, forceIndex: true });
      }
    } catch (error: any) {
      this.log.error(error);
    }
  }

  async updateDevices() {
    try {
      for (const id in this.devices) {
        let applianceState: any;
        if (this.config.local) {
          if (this.devices[id].address) {
            applianceState = await this.midea_beautiful.applianceState$({
              address: this.devices[id].address,
              token: this.devices[id].token,
              key: this.devices[id].key,
              applianceId: id,
            });
          } else {
            this.log.info(`Missing ip for ${id} device update via cloud`);
            applianceState = await this.midea_beautiful.applianceState$({
              cloud: this.cloud,
              applianceId: id,
              useCloud: true,
            });
          }
        } else {
          applianceState = await this.midea_beautiful.applianceState$({
            cloud: this.cloud,
            applianceId: id,
            useCloud: true,
          });
        }
        this.log.debug(await applianceState);
        const stateString = this.pythonToJson(
          await applianceState.state.__dict__.__str__(),
        );
        const stateJson = JSON.parse(stateString);
        // this.json2iob.parse(id, stateJson, { write: true, forceIndex: true });
      }
    } catch (error: any) {
      this.log.error(error);
    }
  }

  pythonToJson(objectString: any) {
    objectString = objectString
      .replaceAll(/b'[^']*'/g, '\'\'')
      .replaceAll(/: <[^<]*>,/g, ':\'\',')
      .replaceAll('{\'_', '{\'')
      .replaceAll(', \'_', ', \'')
      .replaceAll('\'', '"')
      .replaceAll(' None,', 'null,')
      .replaceAll(' True,', 'true,')
      .replaceAll(' False,', 'false,');

    this.log.debug(objectString);
    return objectString;
  }

  onUnload() {
    try {
      process.exit();
      // this.updateInterval && clearInterval(this.updateInterval);
      // this.refreshTimeout && clearTimeout(this.refreshTimeout);
      // callback();
    } catch (error: any) {
      // callback();
    }
  }

  //   async onStateChange(id: string, state: ioBroker.State | null | undefined) {
  //     if (state && !state.ack) {
  //       const deviceId = id.split(".")[2];
  //       const command = id.split(".").pop;
  //       const index = Object.keys(this.devices).indexOf(deviceId);
  //       const appliance = await this.appliances[index];
  //       const setState = { cloud: this.cloud };
  //       setState[command] = state.val;
  //       this.log.debug(JSON.stringify(setState));
  //       try {
  //         await appliance.set_state$(setState);
  //       } catch (error) {
  //         this.log.error(error);
  //         error.stack && this.log.error(error.stack);
  //       }
  //       clearTimeout(this.refreshTimeout);
  //       this.refreshTimeout = setTimeout(async () => {
  //         await this.updateDevices();
  //       }, 10 * 1000);
  //     }
  //   }
  // }

  // if (require.main !== module) {
  //   // Export the constructor in compact mode
  //   /**
  //    * @param {Partial<utils.AdapterOptions>} [options={}]
  //    */
  //   module.exports = (options: Partial<utils.AdapterOptions>) => new Midea(options);
  // } else {
  //   // otherwise start the instance directly
  //   new Midea();
}