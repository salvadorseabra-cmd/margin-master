import { assertEquals } from "jsr:@std/assert@1";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "./invoice-monetary-binding.ts";

Deno.test("Rule B: Pomodor DESC 20% bleed → net unit from gross", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "POMODORI PELATI (CX 2,5KG*6)",
    quantity: 2,
    unit: "uni",
    gross_unit_price: 27.56,
    discount_pct: 20,
    line_total_net: 40,
    unit_price: 20,
    total: 40,
  }]));

  assertEquals(items[0].unit_price, 22.05);
  assertEquals(items[0].total, 40);
});

Deno.test("Rule E: Pomodor neighbour P.VENDA bleed → net unit from gross", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([
    {
      name: "MEZZI PACCHERI MANCINI (CX 1KG*6)",
      quantity: 1,
      unit: "uni",
      gross_unit_price: 27.56,
      discount_pct: null,
      line_total_net: 27.3,
      unit_price: 27.56,
      total: 27.3,
    },
    {
      name: "POMODORI PELATI (CX 2,5KG*6)",
      quantity: 2,
      unit: "uni",
      gross_unit_price: 27.56,
      discount_pct: 20,
      line_total_net: 40,
      unit_price: 27.56,
      total: 54.2,
    },
  ]));

  assertEquals(items[1].unit_price, 22.05);
  assertEquals(items[1].total, 40);
});

Deno.test("Structured binding: Pomodor v21 VALOR fields with gross+discount", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "POMODORI PELATI (CX 2,5KG*6)",
    quantity: 1,
    unit: "uni",
    gross_unit_price: 27.56,
    discount_pct: 20,
    line_total_net: 22.05,
    unit_price: 22.05,
    total: 22.05,
  }]));

  assertEquals(items[0].unit_price, 22.05);
  assertEquals(items[0].total, 22.05);
});

Deno.test("Regression: Mozzarella legitimate discount line preserved", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "MOZZARELLA FIOR DI LATTE",
    quantity: 10,
    unit: "uni",
    gross_unit_price: 9.5,
    discount_pct: 14.5,
    line_total_net: 81.23,
    unit_price: 9.5,
    total: 81.23,
  }]));

  assertEquals(items[0].unit_price, 8.12);
  assertEquals(items[0].total, 81.23);
});

Deno.test("Regression: plain row without discount unchanged", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "RICOTTA TREVIGIANA 1,5KG",
    quantity: 1,
    unit: "uni",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 7.97,
    total: 7.97,
  }]));

  assertEquals(items[0].unit_price, 7.97);
  assertEquals(items[0].total, 7.97);
});

Deno.test("v21 legacy-only row without structured fields unchanged", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "POMODORI PELATI (CX 2,5KG*6)",
    quantity: 1,
    unit: "uni",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 22.05,
    total: 22.05,
  }]));

  assertEquals(items[0].unit_price, 22.05);
  assertEquals(items[0].total, 22.05);
});

Deno.test("Rule B: Prosciutto Desc.(%) 17 bleed", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "Rovagnati Prosciutto Cotto",
    quantity: 4.3,
    unit: "kg",
    gross_unit_price: 10.3,
    discount_pct: 17.5,
    line_total_net: 36.54,
    unit_price: 17,
    total: 36.54,
  }]));

  assertEquals(items[0].unit_price, 8.5);
  assertEquals(items[0].total, 36.54);
});
