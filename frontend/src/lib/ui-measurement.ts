export type RequestMeasurement = {
  headers:(status:number,gatewayId:string|null)=>void;
  body:()=>void;
  parsed:()=>void;
  validated:()=>void;
  failed:(kind:string)=>void;
};
export type UiSample = {data:object|null;surface:string;stateKey:string;rowCount:number;condition:string};
export type UiAction = {action:string;surface:string;expectedStateKey?:string;requiresDataChange?:boolean;navigation?:boolean};
export type UiMeasurementPort = {
  watchedAddress:string|null;
  beginBatch:()=>string;
  request:(batchId:string|undefined,path:string)=>RequestMeasurement;
  span:<T>(batchId:string|undefined,name:string,run:()=>T)=>T;
  bindSnapshot:(data:object,batchId:string)=>void;
  failBatch:(batchId:string,kind:string)=>void;
};

// The dedicated QA Vite config replaces this inert module; product builds collect nothing.
export const uiMeasurement:UiMeasurementPort|null=null;
export function useUiMeasurement(_sample:UiSample):void {}
export function runUiAction<T>(_action:UiAction,run:()=>T):T {return run();}
