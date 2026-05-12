// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY VALIDATOR — REAL-TIME STOCK VALIDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════
// Provides centralized inventory checking for product orders:
// - Real-time stock level verification
// - Quantity limit enforcement
// - Out-of-stock alternative suggestions
// - Low-stock urgency messaging
// ═══════════════════════════════════════════════════════════════════════════

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface ProductStock {
  id: string;
  name: string;
  price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  status: StockStatus;
  available: number; // Effective available quantity
}

export interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number | null;
}

export interface InventoryValidationResult {
  valid: boolean;
  items: CartItemValidation[];
  total_amount: number;
  errors: string[];
  warnings: string[];
  suggestions: ProductStock[];
  formatted_summary: string;
  formatted_errors: string;
}

export interface CartItemValidation {
  product_id: string;
  product_name: string;
  requested_quantity: number;
  available_quantity: number;
  unit_price: number | null;
  line_total: number;
  status: StockStatus;
  valid: boolean;
  error: string | null;
  warning: string | null;
  adjusted_quantity: number | null; // If we had to cap quantity
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK STATUS CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════

export function classifyStock(
  stock_quantity: number | null,
  low_stock_threshold: number | null
): StockStatus {
  const qty = stock_quantity ?? 0;
  const threshold = low_stock_threshold ?? 5;

  if (qty <= 0) return 'out_of_stock';
  if (qty <= threshold) return 'low_stock';
  return 'in_stock';
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT STOCK MAPPER
// ═══════════════════════════════════════════════════════════════════════════

export function mapProductStock(product: {
  id: string;
  name: string;
  price?: number | null;
  stock_quantity?: number | null;
  low_stock_threshold?: number | null;
}): ProductStock {
  const qty = product.stock_quantity ?? 0;
  const threshold = product.low_stock_threshold ?? 5;
  return {
    id: product.id,
    name: product.name,
    price: product.price ?? null,
    stock_quantity: qty,
    low_stock_threshold: threshold,
    status: classifyStock(qty, threshold),
    available: Math.max(0, qty),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CART VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export function validateCart(
  cartItems: CartItem[],
  productCatalog: ProductStock[]
): InventoryValidationResult {
  const result: InventoryValidationResult = {
    valid: true,
    items: [],
    total_amount: 0,
    errors: [],
    warnings: [],
    suggestions: [],
    formatted_summary: '',
    formatted_errors: '',
  };

  if (!cartItems || cartItems.length === 0) {
    result.valid = false;
    result.errors.push('Cart is empty');
    result.formatted_errors = 'Your cart is empty. Please select at least one product.';
    return result;
  }

  for (const item of cartItems) {
    const product = productCatalog.find(p => p.id === item.product_id);

    if (!product) {
      const validation: CartItemValidation = {
        product_id: item.product_id,
        product_name: item.product_name,
        requested_quantity: item.quantity,
        available_quantity: 0,
        unit_price: item.unit_price,
        line_total: 0,
        status: 'out_of_stock',
        valid: false,
        error: `Product "${item.product_name}" not found in catalog`,
        warning: null,
        adjusted_quantity: null,
      };
      result.items.push(validation);
      result.errors.push(validation.error!);
      result.valid = false;
      continue;
    }

    const validation: CartItemValidation = {
      product_id: product.id,
      product_name: product.name,
      requested_quantity: item.quantity,
      available_quantity: product.available,
      unit_price: product.price,
      line_total: 0,
      status: product.status,
      valid: true,
      error: null,
      warning: null,
      adjusted_quantity: null,
    };

    // Out of stock
    if (product.status === 'out_of_stock') {
      validation.valid = false;
      validation.error = `"${product.name}" is currently out of stock`;
      result.errors.push(validation.error);
      result.valid = false;

      // Find alternatives
      const alternatives = productCatalog
        .filter(p => p.id !== product.id && p.status !== 'out_of_stock')
        .slice(0, 3);
      result.suggestions.push(...alternatives);
    }
    // Insufficient stock
    else if (item.quantity > product.available) {
      validation.valid = false;
      validation.error = `Only ${product.available} "${product.name}" available (requested ${item.quantity})`;
      validation.adjusted_quantity = product.available;
      result.errors.push(validation.error);
      result.valid = false;
    }
    // Low stock warning
    else if (product.status === 'low_stock') {
      validation.warning = `Only ${product.available} "${product.name}" left — order soon!`;
      result.warnings.push(validation.warning);
    }

    // Calculate line total
    if (validation.valid || validation.adjusted_quantity) {
      const qty = validation.adjusted_quantity ?? item.quantity;
      validation.line_total = (product.price ?? 0) * qty;
      result.total_amount += validation.line_total;
    }

    result.items.push(validation);
  }

  // Build formatted summary
  const validItems = result.items.filter(i => i.valid);
  if (validItems.length > 0) {
    const lines = validItems.map(i => {
      const price = i.unit_price ? ` @ ₦${i.unit_price.toLocaleString()}` : '';
      return `• ${i.requested_quantity}x ${i.product_name}${price}`;
    });
    result.formatted_summary = lines.join('\n') +
      (result.total_amount > 0 ? `\n\nTotal: ₦${result.total_amount.toLocaleString()}` : '');
  }

  // Build formatted errors
  if (result.errors.length > 0) {
    result.formatted_errors = result.errors.join('\n');
    if (result.suggestions.length > 0) {
      const altNames = [...new Set(result.suggestions.map(s => s.name))].slice(0, 3);
      result.formatted_errors += `\n\nAlternatives available: ${altNames.join(', ')}`;
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY-AWARE ORDER BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildOrderPayload(
  receptionistId: string,
  customerName: string,
  validatedItems: CartItemValidation[],
  options?: {
    customerEmail?: string | null;
    customerPhone?: string | null;
    deliveryAddress?: string | null;
    notes?: string | null;
    sessionId?: string;
    idempotencyKey?: string | null;
  }
): {
  p_receptionist_id: string;
  p_customer_name: string;
  p_items: Array<{
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number | null;
  }>;
  p_customer_email?: string | null;
  p_customer_phone?: string | null;
  p_notes?: string | null;
  p_metadata?: Record<string, unknown>;
  p_idempotency_key?: string | null;
} {
  const metadata: Record<string, unknown> = {
    session_id: options?.sessionId,
    ordered_via: 'widget_chat_auto',
    delivery_address: options?.deliveryAddress || null,
    inventory_validated: true,
  };
  if (options?.idempotencyKey) {
    metadata.idempotency_key = options.idempotencyKey;
  }
  return {
    p_receptionist_id: receptionistId,
    p_customer_name: customerName,
    p_items: validatedItems
      .filter(i => i.valid)
      .map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.adjusted_quantity ?? i.requested_quantity,
        unit_price: i.unit_price,
      })),
    p_customer_email: options?.customerEmail || null,
    p_customer_phone: options?.customerPhone || null,
    p_notes: options?.notes || null,
    p_metadata: metadata,
    p_idempotency_key: options?.idempotencyKey || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK DEDUCTION HELPER (POST-ORDER)
// ═══════════════════════════════════════════════════════════════════════════

export async function deductStock(
  supabase: any,
  items: Array<{ product_id: string; quantity: number }>
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const item of items) {
    // Use atomic RPC function with row-level locking
    const { data, error } = await supabase.rpc('deduct_stock', {
      p_product_id: item.product_id,
      p_quantity: item.quantity,
    });

    if (error) {
      errors.push(`Failed to deduct stock for ${item.product_id}: ${error.message}`);
      continue;
    }

    const result = data as { success: boolean; error?: string; available?: number };
    if (!result.success) {
      errors.push(result.error || `Stock deduction failed for ${item.product_id}`);
    }
  }

  return { success: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createInventoryValidator(supabase: any) {
  return {
    async getProductStock(receptionistId: string): Promise<ProductStock[]> {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, stock_quantity, low_stock_threshold')
        .eq('receptionist_id', receptionistId)
        .eq('is_product', true)
        .eq('active', true);

      if (error || !data) return [];
      return data.map(mapProductStock);
    },

    async validateAndBuild(
      receptionistId: string,
      cartItems: CartItem[],
      customerName: string,
      options?: {
        customerEmail?: string | null;
        customerPhone?: string | null;
        deliveryAddress?: string | null;
        sessionId?: string;
      }
    ): Promise<{
      validation: InventoryValidationResult;
      orderPayload: ReturnType<typeof buildOrderPayload> | null;
    }> {
      const catalog = await this.getProductStock(receptionistId);
      const validation = validateCart(cartItems, catalog);

      if (!validation.valid) {
        return { validation, orderPayload: null };
      }

      const orderPayload = buildOrderPayload(
        receptionistId,
        customerName,
        validation.items,
        options
      );

      return { validation, orderPayload };
    },

    async executeOrder(
      receptionistId: string,
      cartItems: CartItem[],
      customerName: string,
      options?: {
        customerEmail?: string | null;
        customerPhone?: string | null;
        deliveryAddress?: string | null;
        sessionId?: string;
        idempotencyKey?: string | null;
      }
    ): Promise<{
      success: boolean;
      orderId: string | null;
      validation: InventoryValidationResult;
      errors: string[];
    }> {
      const { validation, orderPayload } = await this.validateAndBuild(
        receptionistId, cartItems, customerName, options
      );

      if (!validation.valid || !orderPayload) {
        return {
          success: false,
          orderId: null,
          validation,
          errors: validation.errors,
        };
      }

      // Use the create_widget_order RPC for atomic order creation
      const { data: orderId, error } = await supabase.rpc('create_widget_order', {
        p_receptionist_id: orderPayload.p_receptionist_id,
        p_customer_name: orderPayload.p_customer_name,
        p_items: JSON.stringify(orderPayload.p_items),
        p_customer_email: orderPayload.p_customer_email,
        p_customer_phone: orderPayload.p_customer_phone,
        p_notes: orderPayload.p_notes,
        p_metadata: orderPayload.p_metadata,
        p_idempotency_key: orderPayload.p_idempotency_key,
      });

      if (error) {
        return {
          success: false,
          orderId: null,
          validation,
          errors: [`Order creation failed: ${error.message}`],
        };
      }

      // Deduct stock
      const deductItems = validation.items
        .filter(i => i.valid)
        .map(i => ({
          product_id: i.product_id,
          quantity: i.adjusted_quantity ?? i.requested_quantity,
        }));

      const stockResult = await deductStock(supabase, deductItems);
      if (!stockResult.success) {
        console.warn('[Inventory] Stock deduction warnings:', stockResult.errors);
      }

      return {
        success: true,
        orderId: orderId,
        validation,
        errors: [],
      };
    },
  };
}
