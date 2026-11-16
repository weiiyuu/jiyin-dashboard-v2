import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EventsPage from "@/app/history/events/page";

describe("anomaly events V2 page shell",()=>{
  it("renders the approved filter shell without the retired Yellow KPI",()=>{
    const html=renderToStaticMarkup(<EventsPage/>);
    expect(html).toContain("分析範圍");
    expect(html).toContain("異常類型");
    expect(html).toContain("進階篩選");
    expect(html).toContain("套用條件");
    expect(html).not.toContain("黃燈狀態時數");
  });
});
