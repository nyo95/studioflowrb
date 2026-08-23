import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
export function Heading({level=2,children}:{level?:1|2|3|4|5|6;children:ReactNode}){const Tag=`h${level}` as "h1";return <Tag className={`ui-heading-${level}`}>{children}</Tag>}
export function Text({children,meta=false}:{children:ReactNode;meta?:boolean}){return <span className={meta?"ui-meta":undefined}>{children}</span>}
export function Button({variant="default",...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"default"|"primary"|"danger"}){return <button type="button" className="ui-button" data-variant={variant}{...props}/>}
export function Input(props:InputHTMLAttributes<HTMLInputElement>){return <input className="ui-input" {...props}/>}
export function Field({label,description,error,required,children}:{label:string;description?:ReactNode;error?:ReactNode;required?:boolean;children:ReactNode}){return <label className="ui-field"><span>{label}{required?" *":""}</span>{description&&<span className="ui-field-description">{description}</span>}{children}{error&&<span className="ui-field-error" role="alert">{error}</span>}</label>}
