import {cancelPaymentPendingKey,decodePendingCancelPayment,sameCancelRecord,type PendingCancelPayment} from "./cancel-payment-model";

export function browserCancelPaymentStorage(){
  const read=(account:string)=>{
    try{return decodePendingCancelPayment(localStorage.getItem(cancelPaymentPendingKey(account)),account);}
    catch(error){if(error instanceof Error&&error.message==="cancel.pendingCorrupt")throw error;throw new Error("cancel.storageUnavailable");}
  };
  return {read,
    save:(record:PendingCancelPayment)=>{
      try{
        const key=cancelPaymentPendingKey(record.account),raw=JSON.stringify(record);
        decodePendingCancelPayment(raw,record.account);localStorage.setItem(key,raw);
        if(localStorage.getItem(key)!==raw)throw 0;
      }catch{throw new Error("cancel.storageUnavailable");}
    },
    clear:(record:PendingCancelPayment)=>{
      try{
        const saved=read(record.account);
        if(saved&&!sameCancelRecord(saved,record))throw new Error("cancel.storageChanged");
        if(saved){const key=cancelPaymentPendingKey(record.account);localStorage.removeItem(key);if(localStorage.getItem(key)!==null)throw 0;}
      }catch(error){if(error instanceof Error&&error.message==="cancel.storageChanged")throw error;throw new Error("cancel.storageUnavailable");}
    },
  };
}
