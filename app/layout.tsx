import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:{default:"Brainrot Control",template:"%s · Brainrot Control"},description:"Private administration for the Brainrot community",robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
