"use client";

// TODO(stub): build the real create-order form. This should let the user pick
// an order type, a source warehouse, a customer (where applicable), and add
// product line items with quantities, then submit to a createOrder server
// action. For now it renders a placeholder shell so the page compiles.

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
}

interface WarehouseOption {
  id: string;
  name: string;
}

interface Props {
  products: ProductOption[];
  warehouses: WarehouseOption[];
}

export function CreateOrderForm({ products, warehouses }: Props) {
  return (
    <div className="hairline bg-[var(--surface)] p-24 flex flex-col gap-12">
      <p className="label-text--lg">Create order</p>
      <p className="mono-sm text-text-muted">
        The create-order form is not yet implemented.
      </p>
      <p className="mono-sm text-text-dim">
        {products.length} product(s) and {warehouses.length} warehouse(s)
        available.
      </p>
    </div>
  );
}
