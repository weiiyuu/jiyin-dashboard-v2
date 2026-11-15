import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProcessingPage from "@/app/history/processing/page";

describe("Stage 5.3 machine operation analysis page shell",()=>{
  it("starts with no implicit machine query and renders the three specified charts in order",()=>{
    const html=renderToStaticMarkup(<ProcessingPage/>);
    expect(html).toContain("機台運轉分析");
    expect(html).toContain("已選 0 台");
    expect(html).toContain("不會自動查詢全部機台");
    const ranking=html.indexOf("1. 累積加工時數排行");
    const trend=html.indexOf("2. 機台運轉趨勢圖");
    const share=html.indexOf("3. 燈號時間占比");
    expect(ranking).toBeGreaterThan(0);
    expect(trend).toBeGreaterThan(ranking);
    expect(share).toBeGreaterThan(trend);
  });
});
