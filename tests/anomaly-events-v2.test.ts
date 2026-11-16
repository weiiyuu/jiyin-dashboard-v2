import { describe, expect, it } from "vitest";
import { classifyAlarmSource, parseAlarmDurationSeconds } from "@/server/statistics/anomaly-events";

describe("anomaly events V2 rules",()=>{
  it("parses exact English duration text without inventing missing values",()=>{
    expect(parseAlarmDurationSeconds("1 minute")).toBe(60);
    expect(parseAlarmDurationSeconds("3 minutes")).toBe(180);
    expect(parseAlarmDurationSeconds("12 hours 14 seconds")).toBe(43_214);
    expect(parseAlarmDurationSeconds("1 hour 2 minutes 3 seconds")).toBe(3_723);
    expect(parseAlarmDurationSeconds(null)).toBeNull();
    expect(parseAlarmDurationSeconds("still active")).toBeNull();
  });

  it("separates environment alerts, completion notifications and unknown classifications",()=>{
    expect(classifyAlarmSource({sensorType:"analog",initialClassification:"環境/類比感測器警示"})).toBe("ENVIRONMENT_ALERT");
    expect(classifyAlarmSource({sensorType:"lamp",initialClassification:"加工完成通知"})).toBe("NON_ANOMALY_NOTIFICATION");
    expect(classifyAlarmSource({sensorType:null,initialClassification:null})).toBe("UNKNOWN");
  });
});
