import type{TransactionClient}from"@platform/core/db";import type{DecimalString}from"@platform/utilities/decimal";import type{PriceParty,WorkPriceKind}from"../domain/pricing-rules";
export type SkuPriceRecord={id:string;skuId:string;supplierPartyId:string|null;amount:DecimalString;currency:string;unitId:string;sourceLinkId:string|null;notes:string|null;createdAt:Date;updatedAt:Date;updatedByUserId:string|null;updatedByLabel:string};
export type SkuPriceWrite={id:string;skuId:string;supplierPartyId:string|null;amount:DecimalString;currency:string;unitId:string;sourceLinkId:string|null;notes:string|null;updatedByUserId:string|null;updatedByLabel:string};
export type SkuPriceContext={sku:{id:string;status:"DRAFT"|"ACTIVE"|"DISCONTINUED";deletedAt:Date|null;baseUnitId:string;purchaseUnitId:string|null;brandId:string|null};unit:{id:string;deletedAt:Date|null}|null;supplier:PriceParty|null;source:{id:string;brandId:string;brandDeletedAt:Date|null}|null;existing:SkuPriceRecord|null};
export type WorkPriceRecord={id:string;code:string;name:string;categoryId:string;vendorPartyId:string|null;spec:unknown|null;dimensionDisplay:string|null;unitId:string;amount:DecimalString;kind:WorkPriceKind;currency:string;scopeNote:string|null;notes:string|null;createdAt:Date;updatedAt:Date;deletedAt:Date|null;updatedByUserId:string|null;updatedByLabel:string};
export type WorkPriceWrite=Omit<WorkPriceRecord,"createdAt"|"updatedAt"|"deletedAt">;
export type WorkPriceContext={category:{kind:"PRODUCT"|"WORK";deletedAt:Date|null}|null;unit:{deletedAt:Date|null}|null;vendor:PriceParty|null};
export interface PricingRepository{
 /** `existing` is the current row for the (skuId, supplierId) pair being written. */
 loadSkuPriceContext(tx:TransactionClient,input:{skuId:string;unitId:string;supplierId:string|null;sourceId:string|null}):Promise<SkuPriceContext|null>;
 /** All current prices of one SKU, deterministically ordered (NULL supplier first, then id). */
 listSkuPrices(tx:TransactionClient,skuId:string):Promise<SkuPriceRecord[]>;
 createSkuPrice(tx:TransactionClient,input:SkuPriceWrite):Promise<SkuPriceRecord>;updateSkuPrice(tx:TransactionClient,id:string,input:Omit<SkuPriceWrite,"id"|"skuId">):Promise<SkuPriceRecord>;deleteSkuPrice(tx:TransactionClient,id:string):Promise<void>;
 listWorkPrices(tx:TransactionClient,includeDeleted:boolean):Promise<WorkPriceRecord[]>;findWorkPrice(tx:TransactionClient,id:string):Promise<WorkPriceRecord|null>;findLiveWorkCode(tx:TransactionClient,code:string,excludeId?:string):Promise<WorkPriceRecord|null>;loadWorkContext(tx:TransactionClient,input:{categoryId:string;unitId:string;vendorId:string|null}):Promise<WorkPriceContext>;createWorkPrice(tx:TransactionClient,input:WorkPriceWrite):Promise<WorkPriceRecord>;updateWorkPrice(tx:TransactionClient,id:string,input:Omit<WorkPriceWrite,"id"|"code">):Promise<WorkPriceRecord>;setWorkDeletedAt(tx:TransactionClient,id:string,value:Date|null):Promise<WorkPriceRecord>;
}
