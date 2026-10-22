"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="panel empty"><h1>We couldn’t load this view.</h1><p>The database may be temporarily unavailable. Your changes have not been retried.</p><button className="button primary" onClick={reset}>Try again</button></section>;}
