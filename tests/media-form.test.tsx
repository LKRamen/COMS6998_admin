// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import MediaForm from "../app/components/media-form";
import type {Media} from "../lib/data";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("preserves the attempted caption and context after a rejected save",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,json:async()=>({error:"Media changed in another tab. Reload before saving."})}));
 const media={id:"00000000-0000-4000-8000-000000000001",caption:"Original caption",context:"Original context",style:"Funny",status:"draft",updated_at:"2026-10-22T00:00:00Z",selected_caption_id:"00000000-0000-4000-8000-000000000002",candidates:[],generation:null} as unknown as Media;
 render(<MediaForm media={media}/>);
 fireEvent.change(screen.getByRole("textbox",{name:/^Visible caption/}),{target:{value:"My carefully edited caption"}});
 fireEvent.change(screen.getByLabelText("Context"),{target:{value:"Additional context"}});
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:/Save draft/}));});
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("another tab"));
 expect((screen.getByRole("textbox",{name:/^Visible caption/}) as HTMLTextAreaElement).value).toBe("My carefully edited caption");
 expect((screen.getByLabelText("Context") as HTMLTextAreaElement).value).toBe("Additional context");
});
it("saves the selected candidate and publishes only on the explicit publish button",async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:false,json:async()=>({error:"Retry later"})});
 vi.stubGlobal("fetch",fetcher);
 const media={id:"00000000-0000-4000-8000-000000000001",caption:"First caption",context:"",style:"Brainrot",status:"draft",updated_at:"2026-10-22T00:00:00Z",selected_caption_id:"first",candidates:[{id:"first",text:"First caption"},{id:"second",text:"Second caption"}],generation:null} as unknown as Media;
 render(<MediaForm media={media}/>);
 fireEvent.click(screen.getByRole("radio",{name:/Second caption/}));
 expect((screen.getByRole("textbox",{name:/^Visible caption/}) as HTMLTextAreaElement).value).toBe("Second caption");
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:/Save draft/})));
 let body=fetcher.mock.calls[0][1].body as FormData;
 expect(body.get("status")).toBe("draft"); expect(body.get("selected_caption_id")).toBe("second");
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:/Publish to Quip/})));
 body=fetcher.mock.calls[1][1].body as FormData;
 expect(body.get("status")).toBe("published"); expect(body.get("caption")).toBe("Second caption");
});

