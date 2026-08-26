import type { TransactionClient } from "@platform/core/db";
import type { DecimalString } from "@platform/utilities/decimal";
import type { SkuKind, SkuMediaKind, SkuRelationState, SkuStatus } from "../domain/sku-rules";

export type SkuMediaRecord = { id: string; kind: SkuMediaKind; url: string; label: string | null; sortOrder: number };
export type SkuRecord = {
 id:string; code:string|null; name:string; slug:string; brandId:string|null; categoryId:string|null; kind:SkuKind; status:SkuStatus; spec:unknown|null;
 dimensionLength:DecimalString|null; dimensionWidth:DecimalString|null; dimensionHeight:DecimalString|null; dimensionUnitId:string|null; dimensionDisplay:string|null;
 baseUnitId:string; purchaseUnitId:string|null; conversion:DecimalString|null; defaultWastePct:DecimalString|null; minimumOrder:DecimalString|null; roundingIncrement:DecimalString|null; notes:string|null; media:SkuMediaRecord[];
 createdAt:Date; updatedAt:Date; deletedAt:Date|null;
};
export type SkuGraphInput = Omit<SkuRecord,"createdAt"|"updatedAt"|"deletedAt">;
export type SkuListFilter = { query?:string; brandId?:string; categoryId?:string; status?:SkuStatus; includeDeleted?:boolean };
export interface SkuRepository {
 list(tx:TransactionClient,filter:SkuListFilter):Promise<SkuRecord[]>; findById(tx:TransactionClient,id:string):Promise<SkuRecord|null>;
 findLiveIdentityConflict(tx:TransactionClient,input:{id?:string;brandId:string|null;slug:string;code:string|null}):Promise<SkuRecord|null>;
 loadRelationState(tx:TransactionClient,input:{brandId:string|null;categoryId:string|null;baseUnitId:string;purchaseUnitId:string|null;dimensionUnitId:string|null;skuId?:string}):Promise<SkuRelationState>;
 create(tx:TransactionClient,input:SkuGraphInput):Promise<SkuRecord>; update(tx:TransactionClient,id:string,input:SkuGraphInput):Promise<SkuRecord>;
 setStatus(tx:TransactionClient,id:string,status:SkuStatus):Promise<SkuRecord>; setDeletedAt(tx:TransactionClient,id:string,value:Date|null):Promise<SkuRecord>;
}
