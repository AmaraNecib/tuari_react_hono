import type { ExactTransactionParticipant } from "./exact-finance.repository";

export type ManualSettlementRecord = {
  id: string;
  externalCounterpartyId: string;
  currency: "DZD";
  payableOriginalEntryId: string;
  receivableOriginalEntryId: string;
  payableSettlementEntryId: string;
  receivableSettlementEntryId: string;
  amountDzd: string;
  recordedAt: string;
  actorUserId: string;
  actorLabel: string;
  note: string | null;
};

export type ManualSettlementReversalRecord = {
  id: string;
  settlementId: string;
  payableReversalEntryId: string;
  receivableReversalEntryId: string;
  recordedAt: string;
  actorUserId: string;
  actorLabel: string;
  reason: string;
};

export interface ManualSettlementRepository extends ExactTransactionParticipant {
  insertSettlement(record: ManualSettlementRecord): void;
  getSettlement(id: string): ManualSettlementRecord | null;
  insertReversal(record: ManualSettlementReversalRecord): void;
  getReversal(settlementId: string): ManualSettlementReversalRecord | null;
}
