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

Deno.test("Effective paid price: Paccheri gross unit with discounted total", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "De Cecco - Paccheri Lisci Nr. 125 - 500g",
    quantity: 24,
    unit: null,
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 2.35,
    total: 50.4,
  }]));

  assertEquals(items[0].unit_price, 2.1);
  assertEquals(items[0].total, 50.4);
});

Deno.test("Effective paid price: Courgettes gross unit with discounted total", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "Courgettes",
    quantity: 3.3,
    unit: "kg",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 1.95,
    total: 5.15,
  }]));

  assertEquals(items[0].unit_price, 1.56);
  assertEquals(items[0].total, 5.15);
});

Deno.test("Effective paid price: Alho Francês gross unit with discounted total", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "Alho Francês",
    quantity: 5.42,
    unit: "kg",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 1.77,
    total: 7.67,
  }]));

  assertEquals(items[0].unit_price, 1.42);
  assertEquals(items[0].total, 7.67);
});

Deno.test("Effective paid price: Prosciutto consistent row unchanged", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg",
    quantity: 4.3,
    unit: "kg",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 8.5,
    total: 36.54,
  }]));

  assertEquals(items[0].unit_price, 8.5);
  assertEquals(items[0].total, 36.54);
});

Deno.test("Effective paid price: San Pellegrino consistent row unchanged", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "SanPellegrino - Acqua in vitro 75cl x 15ud",
    quantity: 2,
    unit: null,
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 19.28,
    total: 38.56,
  }]));

  assertEquals(items[0].unit_price, 19.28);
  assertEquals(items[0].total, 38.56);
});

Deno.test("Effective paid price regression: Mortadella consistent row unchanged", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "Rovagnati - Mortadella IGP \"Massima\" con Pistacchio 1/2 - 3,5kg",
    quantity: 3.11,
    unit: "kg",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 9.99,
    total: 31.07,
  }]));

  assertEquals(items[0].unit_price, 9.99);
  assertEquals(items[0].total, 31.07);
});

Deno.test("Effective paid price: Paccheri gross_unit_price without discount_pct", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "De Cecco - Paccheri Lisci Nr. 125 - 500g",
    quantity: 24,
    unit: null,
    gross_unit_price: 2.35,
    discount_pct: null,
    line_total_net: 50.4,
    unit_price: 2.35,
    total: 50.4,
  }]));

  assertEquals(items[0].unit_price, 2.1);
  assertEquals(items[0].total, 50.4);
});

Deno.test("Effective paid price: Courgettes with line_total_net only", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "Courgettes",
    quantity: 3.3,
    unit: "kg",
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: 5.15,
    unit_price: 1.95,
    total: 5.15,
  }]));

  assertEquals(items[0].unit_price, 1.56);
  assertEquals(items[0].total, 5.15);
});

Deno.test("Effective paid price regression: Aceto total above unit unchanged", () => {
  const items = bindMonetaryColumns(parseMonetaryLineItems([{
    name: "Aceto balsamico di modena IGP pet 5l*2 Toschi",
    quantity: 1,
    unit: null,
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: 15.55,
    total: 16.09,
  }]));

  assertEquals(items[0].unit_price, 15.55);
  assertEquals(items[0].total, 16.09);
});
