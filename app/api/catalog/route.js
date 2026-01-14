// app/api/catalog/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "app", "products.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { categories: [], products: [] },
      { status: 200 }
    );
  }
}
