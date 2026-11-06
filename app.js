/* =====================================================
   ZENVIA - Shared Application Core
   Version: 1.0.0
   ===================================================== */

(function (window) {
  "use strict";

  const ZENVIA = {};

  // -----------------------------------------------------
  // 1. تنظیمات اصلی
  // -----------------------------------------------------

  ZENVIA.CONFIG = {
    NAME: "ZENVIA",

    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",

    CART_KEY: "zenvia_cart",

    STORAGE_BUCKET: "product-images",

    TABLES: {
      PRODUCTS: "products",
      PROFILES: "profiles",
      ORDERS: "orders",
      ORDER_ITEMS: "order_items"
    },

    CATEGORIES: {
      cosmetics: "آرایشی و زیبایی",
      health: "سلامت و بهداشت",
      food: "خوراکی و نوشیدنی",
      other: "سایر محصولات"
    }
  };

  // -----------------------------------------------------
  // 2. ابزارهای عمومی
  // -----------------------------------------------------

  ZENVIA.utils = {

    normalizeText(value) {
      return String(value ?? "")
        .trim()
        .replace(/ي/g, "ی")
        .replace(/ك/g, "ک")
        .replace(/\u200c/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
    },

    formatPrice(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return "نامشخص";
      }

      return new Intl.NumberFormat("fa-IR").format(number) + " تومان";
    },

    formatNumber(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return "۰";
      }

      return new Intl.NumberFormat("fa-IR").format(number);
    },

    formatDate(value) {
      if (!value) return "نامشخص";

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "نامشخص";
      }

      return new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    },

    escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]);
    },

    getQueryParam(name) {
      return new URLSearchParams(window.location.search).get(name);
    },

    showMessage(message, type = "info") {
      const oldMessage = document.querySelector(".zenvia-global-message");

      if (oldMessage) {
        oldMessage.remove();
      }

      const box = document.createElement("div");

      box.className = "zenvia-global-message";
      box.textContent = message;

      const backgrounds = {
        success: "#147d55",
        error: "#b83232",
        warning: "#a66a12",
        info: "#174b3b"
      };

      Object.assign(box.style, {
        position: "fixed",
        top: "18px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "999999",
        padding: "13px 20px",
        borderRadius: "12px",
        color: "#fff",
        background: backgrounds[type] || backgrounds.info,
        fontFamily: "inherit",
        fontSize: "14px",
        textAlign: "center",
        maxWidth: "90%",
        boxShadow: "0 5px 25px rgba(0,0,0,.2)"
      });

      document.body.appendChild(box);

      setTimeout(() => {
        box.remove();
      }, 3500);
    },

    setButtonLoading(button, loading, loadingText = "لطفاً صبر کنید...") {
      if (!button) return;

      if (loading) {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.textContent = loadingText;
      } else {
        button.disabled = false;

        if (button.dataset.originalText) {
          button.textContent = button.dataset.originalText;
          delete button.dataset.originalText;
        }
      }
    }
  };

  // -----------------------------------------------------
  // 3. اتصال Supabase
  // -----------------------------------------------------

  ZENVIA.supabase = null;

  ZENVIA.connect = function () {
    if (ZENVIA.supabase) {
      return ZENVIA.supabase;
    }

    const config = ZENVIA.CONFIG;

    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      throw new Error("تنظیمات اتصال Supabase وارد نشده است.");
    }

    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("کتابخانه Supabase بارگذاری نشده است.");
    }

    ZENVIA.supabase = window.supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY
    );

    return ZENVIA.supabase;
  };

  ZENVIA.isConnected = function () {
    return Boolean(ZENVIA.supabase);
  };

  // -----------------------------------------------------
  // 4. مدیریت محصولات
  // -----------------------------------------------------

  ZENVIA.products = {

    async getAll(options = {}) {
      const db = ZENVIA.connect();

      let query = db
        .from(ZENVIA.CONFIG.TABLES.PRODUCTS)
        .select("*");

      if (options.activeOnly !== false) {
        query = query.eq("is_active", true);
      }

      if (options.availableOnly) {
        query = query.gt("stock", 0);
      }

      if (options.category) {
        query = query.eq("category", options.category);
      }

      if (options.search) {
        const search = ZENVIA.utils.normalizeText(options.search);

        // جست‌وجوی ساده در نام محصول
        query = query.ilike("name", `%${search}%`);
      }

      query = query.order("created_at", {
        ascending: false
      });

      if (Number.isInteger(options.limit) && options.limit > 0) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    },

    async getById(id) {
      if (!id) {
        throw new Error("شناسه محصول مشخص نیست.");
      }

      const db = ZENVIA.connect();

      const { data, error } = await db
        .from(ZENVIA.CONFIG.TABLES.PRODUCTS)
        .select("*")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;

      return data;
    },

    async search(searchText) {
      const products = await this.getAll({
        activeOnly: true,
        availableOnly: true
      });

      const search = ZENVIA.utils.normalizeText(searchText);

      if (!search) return [];

      return products.filter(product => {
        const name = ZENVIA.utils.normalizeText(product.name);
        const description = ZENVIA.utils.normalizeText(
          product.description
        );

        return name.includes(search) ||
          description.includes(search);
      });
    }
  };

  // -----------------------------------------------------
  // 5. مدیریت سبد خرید
  // -----------------------------------------------------

  ZENVIA.cart = {

    get() {
      try {
        const saved = localStorage.getItem(
          ZENVIA.CONFIG.CART_KEY
        );

        const cart = saved ? JSON.parse(saved) : [];

        return Array.isArray(cart) ? cart : [];

      } catch (error) {
        console.error("Cart read error:", error);
        return [];
      }
    },

    save(cart) {
      if (!Array.isArray(cart)) {
        throw new Error("اطلاعات سبد خرید معتبر نیست.");
      }

      localStorage.setItem(
        ZENVIA.CONFIG.CART_KEY,
        JSON.stringify(cart)
      );

      window.dispatchEvent(
        new CustomEvent("zenvia:cart-updated", {
          detail: { cart }
        })
      );

      return cart;
    },

    add(product, quantity = 1) {
      if (!product || !product.id) {
        throw new Error("محصول معتبر نیست.");
      }

      const amount = Math.max(1, Number(quantity) || 1);
      const cart = this.get();

      const existing = cart.find(
        item => String(item.id) === String(product.id)
      );

      if (existing) {
        existing.quantity += amount;
      } else {
        cart.push({
          id: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          image_url: product.image_url || "",
          quantity: amount
        });
      }

      this.save(cart);

      ZENVIA.utils.showMessage(
        "محصول به سبد خرید اضافه شد.",
        "success"
      );

      return cart;
    },

    remove(productId) {
      const cart = this.get().filter(
        item => String(item.id) !== String(productId)
      );

      return this.save(cart);
    },

    updateQuantity(productId, quantity) {
      const amount = Math.max(1, Number(quantity) || 1);
      const cart = this.get();

      const item = cart.find(
        product => String(product.id) === String(productId)
      );

      if (!item) return cart;

      item.quantity = amount;

      return this.save(cart);
    },

    clear() {
      return this.save([]);
    },

    count() {
      return this.get().reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
      );
    },

    total() {
      return this.get().reduce((total, item) => {
        return total +
          (Number(item.price) * Number(item.quantity));
      }, 0);
    }
  };

  // -----------------------------------------------------
  // 6. مدیریت حساب کاربری
  // -----------------------------------------------------

  ZENVIA.auth = {

    async getUser() {
      const db = ZENVIA.connect();

      const { data, error } = await db.auth.getUser();

      if (error) throw error;

      return data.user || null;
    },

    async getSession() {
      const db = ZENVIA.connect();

      const { data, error } = await db.auth.getSession();

      if (error) throw error;

      return data.session || null;
    },

    async signOut() {
      const db = ZENVIA.connect();

      const { error } = await db.auth.signOut();

      if (error) throw error;

      window.location.href = "index.html";
    },

    async requireLogin() {
      const user = await this.getUser();

      if (!user) {
        window.location.href = "login.html";
        return null;
      }

      return user;
    }
  };

  // -----------------------------------------------------
  // 7. مدیریت دسته‌بندی‌ها
  // -----------------------------------------------------

  ZENVIA.categories = {

    getName(category) {
      return ZENVIA.CONFIG.CATEGORIES[category] ||
        "سایر محصولات";
    },

    getAll() {
      return Object.entries(
        ZENVIA.CONFIG.CATEGORIES
      ).map(([id, name]) => ({
        id,
        name
      }));
    }
  };

  // -----------------------------------------------------
  // 8. مدیریت تصاویر
  // -----------------------------------------------------

  ZENVIA.images = {

    getProductImage(product) {
      if (
        product &&
        typeof product.image_url === "string" &&
        product.image_url.trim()
      ) {
        return product.image_url;
      }

      return "";
    },

    setImage(element, imageUrl) {
      if (!element) return;

      if (!imageUrl) {
        element.style.display = "none";
        return;
      }

      element.src = imageUrl;

      element.onerror = function () {
        element.removeAttribute("src");
        element.style.display = "none";
      };
    }
  };

  // -----------------------------------------------------
  // 9. مدیریت خطاها
  // -----------------------------------------------------

  ZENVIA.errors = {

    getMessage(error) {
      if (!error) {
        return "خطای نامشخص رخ داده است.";
      }

      const message = String(
        error.message || error
      );

      if (
        message.includes("Failed to fetch") ||
        message.includes("NetworkError")
      ) {
        return "ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید.";
      }

      if (
        message.includes("Invalid login credentials")
      ) {
        return "ایمیل یا رمز عبور اشتباه است.";
      }

      if (
        message.includes("User already registered")
      ) {
        return "این حساب کاربری قبلاً ثبت شده است.";
      }

      return message;
    },

    show(error) {
      console.error("[ZENVIA ERROR]", error);

      ZENVIA.utils.showMessage(
        this.getMessage(error),
        "error"
      );
    }
  };

  // -----------------------------------------------------
  // 10. رویدادهای عمومی
  // -----------------------------------------------------

  ZENVIA.onReady = function (callback) {
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        callback
      );
    } else {
      callback();
    }
  };

  // -----------------------------------------------------
  // 11. آماده‌سازی سراسری
  // -----------------------------------------------------

  window.ZENVIA = ZENVIA;

  console.log("ZENVIA Core Loaded - Version 1.0.0");

})(window);
