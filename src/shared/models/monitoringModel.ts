export interface MonitoringValue {
  resource: string;
  fb: string;
  port: string;
  value: string;
  forced?: boolean;
  timestamp: number;
}

export interface MonitoringSnapshot {
  values: MonitoringValue[];
}