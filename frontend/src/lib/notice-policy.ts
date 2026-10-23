/** Dismissing a verified result is presentation-only; unresolved sends stay visible. */
export function canDismissTransactionNotice(phase:string,hasEvidence:boolean){
  return ["rejected","reverted","replaced"].includes(phase)||hasEvidence&&["approved","completed","indexing"].includes(phase);
}
