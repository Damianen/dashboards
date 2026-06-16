import { jsonError } from "@/lib/api";
import { barcodeSchema } from "@/lib/schemas/food";
import { NotFoundError } from "@/server/services/errors";
import { getOrFetchProduct } from "@/server/services/food";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ barcode: string }> },
) {
  try {
    const { barcode } = await params;
    const parsed = barcodeSchema.safeParse(barcode);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    const product = await getOrFetchProduct(parsed.data);
    if (!product) throw new NotFoundError("product", parsed.data);
    return Response.json(product);
  } catch (err) {
    return jsonError(err);
  }
}
