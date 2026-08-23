import type { CSSProperties,ReactNode } from "react";import{Heading}from"../primitives";
export function SectionCard({children}:{children:ReactNode}){return <section className="ui-surface ui-section">{children}</section>}
export function PageSection({title,description,children}:{title?:string;description?:ReactNode;children:ReactNode}){return <section className="ui-stack">{title&&<div><Heading level={3}>{title}</Heading>{description&&<p className="ui-field-description">{description}</p>}</div>}{children}</section>}
export function DataTable({children,minWidth,state}:{children?:ReactNode;minWidth?:string|number;state?:ReactNode}){return <div className="ui-surface ui-table-scroll" data-table-overflow="horizontal">{state??<table className="ui-table" style={{minWidth}as CSSProperties}>{children}</table>}</div>}
export const numericCellClassName="ui-align-number";
export function FormSection({title,description,children}:{title:string;description?:ReactNode;children:ReactNode}){return <section className="ui-stack"><div><Heading level={4}>{title}</Heading>{description&&<p className="ui-field-description">{description}</p>}</div>{children}</section>}
export function LoadingState({label="Loading…"}:{label?:string}){return <div className="ui-state" role="status" aria-live="polite">{label}</div>}
export function EmptyState({title,description}:{title:string;description?:ReactNode}){return <div className="ui-state"><Heading level={4}>{title}</Heading>{description}</div>}
export function ErrorState({title="Something went wrong",description}:{title?:string;description?:ReactNode}){return <div className="ui-state ui-state-error" role="alert"><Heading level={4}>{title}</Heading>{description}</div>}
export function InlineError({children}:{children:ReactNode}){return <span className="ui-inline-error" role="alert">{children}</span>}
