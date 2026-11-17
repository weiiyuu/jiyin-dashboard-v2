import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EventsPage from "@/app/history/events/page";
import { Pagination } from "@/components/import-pagination";

describe("anomaly events V2 page shell",()=>{
  it("renders the approved filter shell without the retired Yellow KPI",()=>{
    const html=renderToStaticMarkup(<EventsPage/>);
    expect(html).toContain("分析範圍");
    expect(html).toContain("異常類型");
    expect(html).toContain("套用條件");
    expect(html).toContain("重設");
    expect(html).not.toContain("進階篩選");
    expect(html).not.toContain("規則名稱");
    expect(html).not.toContain("機台（已選");
    expect(html).not.toContain("感測器編號或名稱");
    expect(html).not.toContain("黃燈狀態時數");
  });

  it("keeps the detail count and page-size selector on one page, and restores full navigation on multiple pages",()=>{
    const single=renderToStaticMarkup(<Pagination page={1} totalPages={1} total={8} pageSize={20} loading={false} onPageChange={()=>{}} onPageSizeChange={()=>{}} layout="three-zone"/>);
    expect(single).toContain("共 8 筆");
    expect(single).toContain("每頁顯示");
    expect(single).toContain('aria-label="上一頁"');
    expect(single).toContain("前往");
    expect(single).not.toContain("第 1 / 1 頁");
    const multiple=renderToStaticMarkup(<Pagination page={3} totalPages={7} total={126} pageSize={20} loading={false} onPageChange={()=>{}} onPageSizeChange={()=>{}} layout="three-zone"/>);
    expect(multiple).toContain("共 126 筆");
    expect(multiple).toContain('aria-label="上一頁"');
    expect(multiple).toContain('aria-label="下一頁"');
    expect(multiple).toContain("前往");
    expect(multiple).toContain('aria-current="page"');
  });
});
