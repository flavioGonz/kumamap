declare module "onvif" {
  export const Discovery: {
    probe(options: any, callback: (err: any, cams: any[]) => void): void;
    probe(callback: (err: any, cams: any[]) => void): void;
    on(event: string, listener: (...args: any[]) => void): void;
  };

  export class Cam {
    constructor(options: any, callback: (err: any) => void);
    deviceInformation: {
      manufacturer?: string;
      model?: string;
      firmwareVersion?: string;
      serialNumber?: string;
      hardwareId?: string;
    };
    activeSource: {
      profileToken?: string;
      sourceToken?: string;
      videoSourceConfigurationToken?: string;
    } | null;
    getStreamUri(options: any, callback: (err: any, stream: any) => void): void;
    getSnapshotUri(options: any, callback: (err: any, snap: any) => void): void;
    getProfiles(callback: (err: any, profiles: any[]) => void): void;
    getDeviceInformation(callback: (err: any, info: any) => void): void;
  }
}
