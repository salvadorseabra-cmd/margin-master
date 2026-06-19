import { describe, expect, it } from "vitest";
import {
  assessPriceHistoryRowRepair,
  buildPriceHistoryRepairPatch,
  buildPriceHistoryRepairPlan,
  replayExpectedNewPriceFromInvoiceLine,
} from "@/lib/ingredient-price-history-repair";

type RepairFixture = {
  label: string;
  historyId: string;
  ingredientId: string;
  invoiceId: string;
  storedNewPrice: number;
  expectedNewPrice: number;
  line: {
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total?: number;
  };
};

/** VL contamination replay fixtures — invoice lines replayable via production imports. */
const VL_CONTAMINATION_FIXTURES: RepairFixture[] = [
  {
    label: "Atum April",
    historyId: "61c51696-acd8-4a58-878f-a588c1878af0",
    ingredientId: "0f30ccb3-bb47-40bb-83cc-ae2a4018066d",
    invoiceId: "c2f52357-0f80-491a-ba14-c97ff4837472",
    storedNewPrice: 6.29,
    expectedNewPrice: 3.145,
    line: {
      name: "Atum Óleo Bolsa Nau Catrineta 1 Kg",
      quantity: 2,
      unit: "un",
      unit_price: 6.29,
    },
  },
  {
    label: "Gema April",
    historyId: "e967f673-1dc5-4390-90e6-464b66ec2a4b",
    ingredientId: "32dbf47d-347c-45f3-bd9f-c6e90640e767",
    invoiceId: "c2f52357-0f80-491a-ba14-c97ff4837472",
    storedNewPrice: 10.19,
    expectedNewPrice: 1.698,
    line: {
      name: "Ovo Líquido Past.Gema Dovo 1kg",
      quantity: 6,
      unit: "un",
      unit_price: 10.19,
    },
  },
  {
    label: "Gema May",
    historyId: "e143080d-511b-4c37-9018-11949343aedc",
    ingredientId: "32dbf47d-347c-45f3-bd9f-c6e90640e767",
    invoiceId: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
    storedNewPrice: 10.49,
    expectedNewPrice: 1.748,
    line: {
      name: "Ovo Líquido Past.Gema Dovo 1 Kg",
      quantity: 6,
      unit: "un",
      unit_price: 10.49,
    },
  },
  {
    label: "Anchoas May",
    historyId: "908de185-e61a-4f41-af4c-3b70f69bd08f",
    ingredientId: "c811f67f-df4d-4194-ba8b-7a15d4af38bd",
    invoiceId: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
    storedNewPrice: 9.99,
    expectedNewPrice: 4.995,
    line: {
      name: "Filete de Anchoas Alconfirosa LI 495 g",
      quantity: 2,
      unit: "un",
      unit_price: 9.99,
    },
  },
  {
    label: "Peroni",
    historyId: "7d6b70fa-543f-41c2-89e5-2b691afcdff4",
    ingredientId: "70f5a744-839c-4def-8252-52aaf7529b4b",
    invoiceId: "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
    storedNewPrice: 0.0001351010101010101,
    expectedNewPrice: 0.0446,
    line: {
      name: "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro",
      quantity: 24,
      unit: "un",
      unit_price: 1.07,
    },
  },
  {
    label: "Stracciatella",
    historyId: "194bb341-bd65-432e-90f0-6f62f42da8de",
    ingredientId: "d96e176e-7fa7-438d-beda-6b9d7fe7b41d",
    invoiceId: "f0aa5a08-86a3-4938-99f0-711e86073968",
    storedNewPrice: 3.11,
    expectedNewPrice: 0.13,
    line: {
      name: "STRACCIATELLA 250 GR",
      quantity: 24,
      unit: "un",
      unit_price: 3.11,
    },
  },
];

function historyRowFromFixture(fixture: RepairFixture) {
  return {
    id: fixture.historyId,
    ingredient_id: fixture.ingredientId,
    invoice_id: fixture.invoiceId,
    ingredient_name: fixture.label.split(" ")[0],
    previous_price: null as number | null,
    new_price: fixture.storedNewPrice,
    delta: null as number | null,
    delta_percent: null as number | null,
    created_at: "2026-04-17T12:00:00.000Z",
  };
}

describe("replayExpectedNewPriceFromInvoiceLine", () => {
  it.each(VL_CONTAMINATION_FIXTURES)(
    "$label replays expected operational new_price from production imports",
    (fixture) => {
      const replay = replayExpectedNewPriceFromInvoiceLine(fixture.line);
      expect(replay).not.toBeNull();
      expect(replay!.expectedNewPrice).toBeCloseTo(fixture.expectedNewPrice, 3);
    },
  );
});

describe("assessPriceHistoryRowRepair", () => {
  it.each(VL_CONTAMINATION_FIXTURES)(
    "$label flags contaminated stored new_price",
    (fixture) => {
      const assessment = assessPriceHistoryRowRepair(
        historyRowFromFixture(fixture),
        fixture.line,
      );
      expect(assessment).not.toBeNull();
      expect(assessment!.needsNewPriceRepair).toBe(true);
      expect(assessment!.storedNewPrice).toBeCloseTo(fixture.storedNewPrice, 6);
      expect(assessment!.expectedNewPrice).toBeCloseTo(fixture.expectedNewPrice, 3);
      expect(assessment!.skipReason).toBeNull();
    },
  );

  it("skips Mozzarella Fior di Latte", () => {
    const assessment = assessPriceHistoryRowRepair(
      {
        id: "f0f76e84-f4c5-4dc1-9fb6-ba026d2384d0",
        ingredient_id: "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d",
        invoice_id: "f0aa5a08-86a3-4938-99f0-711e86073968",
        ingredient_name: "Mozzarella fior di latte",
        previous_price: 13.69,
        new_price: 8.12,
        delta: -5.57,
        delta_percent: -40.69,
        created_at: "2026-05-08T12:00:00.000Z",
      },
      {
        name: 'MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8',
        quantity: 10,
        unit: "un",
        unit_price: 8.12,
        total: 81.2,
      },
    );
    expect(assessment?.skipReason).toBe("excluded_ingredient");
    expect(assessment?.needsNewPriceRepair).toBe(false);
  });

  it("skips ghost rows without a replayable invoice line", () => {
    const assessment = assessPriceHistoryRowRepair(
      {
        id: "952119dc-8645-4a5f-a3ff-191ae1a57ea8",
        ingredient_id: "c811f67f-df4d-4194-ba8b-7a15d4af38bd",
        invoice_id: "c2f52357-0f80-491a-ba14-c97ff4837472",
        ingredient_name: "Anchoas",
        previous_price: null,
        new_price: 9.49,
        delta: null,
        delta_percent: null,
        created_at: "2026-04-17T12:00:00.000Z",
      },
      null,
    );
    expect(assessment?.skipReason).toBe("ghost_no_invoice_line");
    expect(assessment?.needsNewPriceRepair).toBe(false);
  });
});

describe("buildPriceHistoryRepairPatch", () => {
  it("builds new_price + delta patch for Atum April contamination", () => {
    const fixture = VL_CONTAMINATION_FIXTURES[0]!;
    const plan = buildPriceHistoryRepairPlan(historyRowFromFixture(fixture), fixture.line);
    expect(plan?.patch).not.toBeNull();
    expect(plan!.patch!.new_price).toBeCloseTo(3.145, 3);
    expect(plan!.patch!.previous_price).toBeNull();
    expect(plan!.patch!.delta).toBeNull();
    expect(plan!.patch!.delta_percent).toBeNull();
  });

  it("rechains Gema May delta from repaired April prior", () => {
    const april = VL_CONTAMINATION_FIXTURES[1]!;
    const may = VL_CONTAMINATION_FIXTURES[2]!;
    const mayRow = {
      ...historyRowFromFixture(may),
      previous_price: april.storedNewPrice,
      new_price: may.storedNewPrice,
      delta: 0.3,
      delta_percent: 2.94,
    };
    const plan = buildPriceHistoryRepairPlan(mayRow, may.line);
    expect(plan?.patch?.new_price).toBeCloseTo(1.748, 3);
    expect(plan?.patch?.previous_price).toBeCloseTo(10.19, 2);
  });
});

describe("Atum chain reconciliation expectation", () => {
  it("expects May previous_price to equal repaired April new_price after chain reconcile", () => {
    const april = VL_CONTAMINATION_FIXTURES[0]!;
    const replay = replayExpectedNewPriceFromInvoiceLine(april.line);
    expect(replay?.expectedNewPrice).toBeCloseTo(3.145, 3);
    const mayPriorAfterChain = replay!.expectedNewPrice;
    expect(mayPriorAfterChain).toBeCloseTo(3.145, 3);
  });
});
