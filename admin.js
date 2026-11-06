/* =====================================================
   ZENVIA - Admin Panel Logic
   Version: 1.0.0
   ===================================================== */

(function (window) {
  "use strict";

  const Admin = {};

  let db = null;
  let currentUser = null;
  let editingProductId = null;
  let currentImagePath = null;

  const $ = selector => document.querySelector(selector);

  const categories = {
    cosmetics: "آرایشی و زیبایی",
    health: "سلامت و بهداشت",
    food: "خوراکی و نوشیدنی",
    other: "سایر محصولات"
  };

  const orderStatuses = {
    pending: "در انتظار بررسی",
    confirmed: "تأیید شده",
    processing: "در حال آماده‌سازی",
    shipped: "ارسال شده",
    delivered: "تحویل شده",
    cancelled: "لغو شده"
  };

  function notify(message, type = "info") {
    if (window.ZENVIA?.utils) {
      ZENVIA.utils.showMessage(message, type);
    } else {
      alert(message);
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("fa-IR").format(
      Number(value) || 0
    ) + " تومان";
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const element = getElement(id);
    if (element) element.textContent = value;
  }

  function setLoading(button, loading, text = "در حال انجام...") {
    if (!button) return;

    if (loading) {
      button.dataset.oldText = button.textContent;
      button.disabled = true;
      button.textContent = text;
    } else {
      button.disabled = false;
      button.textContent =
        button.dataset.oldText || button.textContent;
      delete button.dataset.oldText;
    }
  }

  // -----------------------------------------------------
  // 1. راه‌اندازی و احراز هویت مدیر
  // -----------------------------------------------------

  Admin.init = async function () {
    try {
      if (!window.ZENVIA_SUPABASE) {
        throw new Error("فایل supabase.js بارگذاری نشده است.");
      }

      db = ZENVIA_SUPABASE.getClient();

      const { data, error } = await db.auth.getUser();

      if (error) throw error;

      currentUser = data.user;

      if (!currentUser) {
        window.location.href = "login.html";
        return;
      }

      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile || profile.role !== "admin") {
        document.body.innerHTML = `
          <main style="
            direction:rtl;
            font-family:tahoma;
            text-align:center;
            padding:60px 20px;
          ">
            <h2>دسترسی غیرمجاز</h2>
            <p>این حساب اجازه ورود به پنل مدیریت را ندارد.</p>
            <a href="index.html">بازگشت به فروشگاه</a>
          </main>
        `;
        return;
      }

      await Admin.loadDashboard();
      Admin.bindEvents();

    } catch (error) {
      console.error("Admin initialization:", error);
      notify(error.message || "راه‌اندازی پنل ناموفق بود.", "error");
    }
  };

  // -----------------------------------------------------
  // 2. دریافت آمار
  // -----------------------------------------------------

  Admin.loadDashboard = async function () {
    const [products, orders, pending] = await Promise.all([
      db.from("products")
        .select("id", { count: "exact", head: true }),

      db.from("orders")
        .select("id", { count: "exact", head: true }),

      db.from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
    ]);

    if (products.error) throw products.error;
    if (orders.error) throw orders.error;
    if (pending.error) throw pending.error;

    setText("totalProducts", products.count ?? 0);
    setText("totalOrders", orders.count ?? 0);
    setText("pendingOrders", pending.count ?? 0);

    await Admin.loadProducts();
    await Admin.loadOrders();
  };

  // -----------------------------------------------------
  // 3. دریافت و نمایش محصولات
  // -----------------------------------------------------

  Admin.loadProducts = async function () {
    const container = getElement("adminProducts");

    if (!container) return;

    container.innerHTML = "<p>در حال دریافت محصولات...</p>";

    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML =
        "<p>هنوز محصولی ثبت نشده است.</p>";
      return;
    }

    container.innerHTML = data.map(product => `
      <article class="admin-product" data-id="${escapeHTML(product.id)}">
        <img
          src="${escapeHTML(product.image_url || "")}"
          alt="${escapeHTML(product.name)}"
          style="width:85px;height:85px;object-fit:cover;border-radius:12px"
          onerror="this.style.display='none'"
        >

        <div class="admin-product-info">
          <h3>${escapeHTML(product.name)}</h3>

          <p>${formatPrice(product.price)}</p>

          <p>
            موجودی: ${escapeHTML(product.stock)}
            |
            ${escapeHTML(categories[product.category] || "سایر محصولات")}
          </p>

          <p>
            وضعیت:
            ${product.is_active ? "فعال" : "غیرفعال"}
          </p>

          <button
            type="button"
            data-action="edit"
            data-id="${escapeHTML(product.id)}"
          >ویرایش</button>

          <button
            type="button"
            data-action="delete"
            data-id="${escapeHTML(product.id)}"
          >حذف</button>
        </div>
      </article>
    `).join("");
  };

  // -----------------------------------------------------
  // 4. آماده‌سازی فرم محصول
  // -----------------------------------------------------

  Admin.resetProductForm = function () {
    const form = getElement("productForm");

    if (form) form.reset();

    editingProductId = null;
    currentImagePath = null;

    setText("productFormTitle", "افزودن محصول جدید");

    const preview = getElement("productPreview");

    if (preview) {
      preview.removeAttribute("src");
      preview.style.display = "none";
    }
  };

  Admin.editProduct = async function (id) {
    try {
      const { data, error } = await db
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      editingProductId = data.id;
      currentImagePath = data.image_path || null;

      const fields = {
        productName: data.name,
        productDescription: data.description,
        productPrice: data.price,
        productStock: data.stock,
        productCategory: data.category
      };

      Object.entries(fields).forEach(([id, value]) => {
        const element = getElement(id);
        if (element) element.value = value ?? "";
      });

      const active = getElement("productActive");

      if (active) {
        active.checked = Boolean(data.is_active);
      }

      const preview = getElement("productPreview");

      if (preview && data.image_url) {
        preview.src = data.image_url;
        preview.style.display = "block";
      }

      setText("productFormTitle", "ویرایش محصول");

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    } catch (error) {
      notify(error.message, "error");
    }
  };

  // -----------------------------------------------------
  // 5. انتخاب تصویر از گالری
  // -----------------------------------------------------

  Admin.previewImage = function (event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify("فقط فایل تصویری انتخاب کنید.", "error");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notify("حجم تصویر بیشتر از ۵ مگابایت است.", "error");
      event.target.value = "";
      return;
    }

    const preview = getElement("productPreview");

    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
    }
  };

  // -----------------------------------------------------
  // 6. آپلود تصویر
  // -----------------------------------------------------

  Admin.uploadImage = async function (file) {
    if (!file) return null;

    const result = await ZENVIA_SUPABASE.uploadProductImage(
      file,
      currentUser.id
    );

    return {
      url: result.url,
      path: result.path
    };
  };

  // -----------------------------------------------------
  // 7. ثبت یا ویرایش محصول
  // -----------------------------------------------------

  Admin.saveProduct = async function (event) {
    event.preventDefault();

    const button = event.submitter ||
      getElement("saveProductButton");

    try {
      setLoading(button, true, "در حال ذخیره...");

      const name = getElement("productName")?.value.trim();
      const description =
        getElement("productDescription")?.value.trim() || "";

      const price = Number(
        getElement("productPrice")?.value
      );

      const stock = Number(
        getElement("productStock")?.value
      );

      const category =
        getElement("productCategory")?.value;

      const isActive =
        getElement("productActive")?.checked ?? true;

      const imageFile =
        getElement("productImage")?.files?.[0];

      if (!name) {
        throw new Error("نام محصول را وارد کنید.");
      }

      if (!Number.isFinite(price) || price < 0) {
        throw new Error("قیمت محصول معتبر نیست.");
      }

      if (!Number.isInteger(stock) || stock < 0) {
        throw new Error("موجودی باید عدد صحیح و غیرمنفی باشد.");
      }

      if (!categories[category]) {
        throw new Error("دسته‌بندی معتبر نیست.");
      }

      let imageUrl = null;
      let imagePath = currentImagePath;

      if (imageFile) {
        const uploaded = await Admin.uploadImage(imageFile);

        imageUrl = uploaded.url;
        imagePath = uploaded.path;
      }

      const payload = {
        name,
        description,
        price,
        stock,
        category,
        is_active: isActive,
        image_url: imageUrl,
        image_path: imagePath
      };

      if (!imageFile && editingProductId) {
        delete payload.image_url;
        delete payload.image_path;
      }

      if (editingProductId) {
        const { error } = await db
          .from("products")
          .update(payload)
          .eq("id", editingProductId);

        if (error) throw error;

        notify("محصول با موفقیت ویرایش شد.", "success");

      } else {
        const { error } = await db
          .from("products")
          .insert({
            ...payload,
            image_url: imageUrl,
            image_path: imagePath
          });

        if (error) throw error;

        notify("محصول جدید ثبت شد.", "success");
      }

      Admin.resetProductForm();
      await Admin.loadDashboard();

    } catch (error) {
      console.error(error);
      notify(error.message || "ذخیره محصول ناموفق بود.", "error");

    } finally {
      setLoading(button, false);
    }
  };

  // -----------------------------------------------------
  // 8. حذف محصول و تصویر آن
  // -----------------------------------------------------

  Admin.deleteProduct = async function (id) {
    if (!confirm("آیا از حذف این محصول مطمئن هستید؟")) {
      return;
    }

    try {
      const { data: product, error: readError } = await db
        .from("products")
        .select("id,image_path")
        .eq("id", id)
        .single();

      if (readError) throw readError;

      const { error } = await db
        .from("products")
        .delete()
        .eq("id", id);

      if (error) throw error;

      if (product.image_path) {
        try {
          await ZENVIA_SUPABASE.deleteProductImage(
            product.image_path
          );
        } catch (imageError) {
          console.error(
            "Image cleanup failed:",
            imageError
          );
        }
      }

      notify("محصول حذف شد.", "success");

      await Admin.loadDashboard();

    } catch (error) {
      notify(error.message, "error");
    }
  };

  // -----------------------------------------------------
  // 9. دریافت سفارش‌ها
  // -----------------------------------------------------

  Admin.loadOrders = async function () {
    const container = getElement("adminOrders");

    if (!container) return;

    container.innerHTML = "<p>در حال دریافت سفارش‌ها...</p>";

    const { data, error } = await db
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML =
        "<p>هنوز سفارشی ثبت نشده است.</p>";
      return;
    }

    container.innerHTML = data.map(order => `
      <article class="admin-order">
        <h3>سفارش #${escapeHTML(order.id)}</h3>

        <p>شناسه مشتری: ${escapeHTML(order.user_id)}</p>

        <p>مبلغ: ${formatPrice(order.total_amount)}</p>

        <p>تاریخ: ${escapeHTML(
          ZENVIA.utils.formatDate(order.created_at)
        )}</p>

        <label>
          وضعیت سفارش:

          <select data-order-status="${escapeHTML(order.id)}">
            ${Object.entries(orderStatuses).map(([value, label]) => `
              <option
                value="${value}"
                ${order.status === value ? "selected" : ""}
              >${label}</option>
            `).join("")}
          </select>
        </label>

        <button
          type="button"
          data-action="update-order"
          data-id="${escapeHTML(order.id)}"
        >ذخیره وضعیت</button>
      </article>
    `).join("");
  };

  // -----------------------------------------------------
  // 10. تغییر وضعیت سفارش
  // -----------------------------------------------------

  Admin.updateOrderStatus = async function (id) {
    try {
      const select = document.querySelector(
        `[data-order-status="${CSS.escape(String(id))}"]`
      );

      if (!select) return;

      const status = select.value;

      if (!orderStatuses[status]) {
        throw new Error("وضعیت سفارش معتبر نیست.");
      }

      const { error } = await db
        .from("orders")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      notify("وضعیت سفارش به‌روزرسانی شد.", "success");

      await Admin.loadDashboard();

    } catch (error) {
      notify(error.message, "error");
    }
  };

  // -----------------------------------------------------
  // 11. اتصال رویدادها
  // -----------------------------------------------------

  Admin.bindEvents = function () {
    const form = getElement("productForm");

    if (form) {
      form.addEventListener(
        "submit",
        Admin.saveProduct
      );
    }

    const imageInput = getElement("productImage");

    if (imageInput) {
      imageInput.addEventListener(
        "change",
        Admin.previewImage
      );
    }

    const productsContainer = getElement("adminProducts");

    if (productsContainer) {
      productsContainer.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (action === "edit") {
          Admin.editProduct(id);
        }

        if (action === "delete") {
          Admin.deleteProduct(id);
        }
      });
    }

    const ordersContainer = getElement("adminOrders");

    if (ordersContainer) {
      ordersContainer.addEventListener("click", event => {
        const button = event.target.closest(
          'button[data-action="update-order"]'
        );

        if (!button) return;

        Admin.updateOrderStatus(button.dataset.id);
      });
    }

    const resetButton = getElement("resetProductForm");

    if (resetButton) {
      resetButton.addEventListener(
        "click",
        Admin.resetProductForm
      );
    }

    const refreshButton = getElement("refreshDashboard");

    if (refreshButton) {
      refreshButton.addEventListener("click", () => {
        Admin.loadDashboard().catch(error => {
          notify(error.message, "error");
        });
      });
    }

    const logoutButton = getElement("adminLogout");

    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        const { error } = await db.auth.signOut();

        if (error) {
          notify(error.message, "error");
          return;
        }

        window.location.href = "login.html";
      });
    }
  };

  // -----------------------------------------------------
  // 12. خروجی عمومی
  // -----------------------------------------------------

  window.ZENVIA_ADMIN = Admin;

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page === "admin") {
      Admin.init();
    }
  });

})(window);
