import { describe, expect, it } from "vitest";
import { parseVehicles } from "@/lib/form";

describe("parseVehicles", () => {
  it("reads VIN, year, make and model in any order", () => {
    const { vehicles, errors } = parseVehicles("KNDC3DLC1R5215758 2024 Kia EV6\n2021 Ford F-150 Lariat\n\n");
    expect(errors).toEqual([]);
    expect(vehicles).toEqual([
      { vin: "KNDC3DLC1R5215758", year: 2024, make: "Kia", model: "EV6" },
      { vin: null, year: 2021, make: "Ford", model: "F-150 Lariat" },
    ]);
  });

  it("flags VINs with I, O or Q and empty lines without a vehicle", () => {
    const { errors } = parseVehicles("KNDC3DLC1R521575O 2024 Kia\n2024");
    expect(errors).toHaveLength(2);
  });
});
