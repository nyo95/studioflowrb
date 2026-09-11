-- CreateTable
CREATE TABLE "master_data"."SupplierCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."VendorSupplierCategory" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "supplier_category_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorSupplierCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategory_code_key" ON "master_data"."SupplierCategory"("code");

-- CreateIndex
CREATE INDEX "SupplierCategory_deleted_at_idx" ON "master_data"."SupplierCategory"("deleted_at");

-- CreateIndex
CREATE INDEX "VendorSupplierCategory_supplier_category_id_idx" ON "master_data"."VendorSupplierCategory"("supplier_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "VendorSupplierCategory_vendor_id_supplier_category_id_key" ON "master_data"."VendorSupplierCategory"("vendor_id", "supplier_category_id");

-- AddForeignKey
ALTER TABLE "master_data"."VendorSupplierCategory" ADD CONSTRAINT "VendorSupplierCategory_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."VendorSupplierCategory" ADD CONSTRAINT "VendorSupplierCategory_supplier_category_id_fkey" FOREIGN KEY ("supplier_category_id") REFERENCES "master_data"."SupplierCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;