// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import MediaCreator from "../app/components/media-creator";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it("generates privately and preserves the photo and settings after a failure",async()=>{
 vi.stubGlobal("URL",{createObjectURL:vi.fn(()=>"blob:photo"),revokeObjectURL:vi.fn()});
 const fetcher=vi.fn().mockResolvedValue({ok:false,json:async()=>({error:"Provider busy"})}); vi.stubGlobal("fetch",fetcher);
 render(<MediaCreator/>);
 expect((screen.getByRole("button",{name:"Generate 3 captions"}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText("Upload photo"),{target:{files:[new File(["photo"],"photo.png",{type:"image/png"})]}});
 fireEvent.click(screen.getByRole("button",{name:"College life"}));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Generate 3 captions"})));
 const body=fetcher.mock.calls[0][1].body as FormData;
 expect(body.get("status")).toBe("draft");expect(body.get("style")).toBe("College life");
 expect(screen.getByRole("alert").textContent).toBe("Provider busy");
 expect(screen.getByRole("img",{name:"Selected photo preview"})).toBeTruthy();
 expect(screen.getByRole("button",{name:"College life"}).getAttribute("aria-pressed")).toBe("true");
});
