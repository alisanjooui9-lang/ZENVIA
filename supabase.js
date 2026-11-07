/* =====================================================
   ZENVIA - Supabase Configuration
   Version: 1.0.0
   ===================================================== */

(function (window) {
  "use strict";

  const CONFIG = {
    URL: "https://tmhtfvbrcukvnlieqcno.supabase.co/rest/v1/",
    ANON_KEY: "sb_publishable_KL5EIRCqYAt7pp1DjHo95Q_AR1VnN2N",

    STORAGE_BUCKET: "product-images",

    TABLES: {
      PRODUCTS: "products",
      PROFILES: "profiles",
      ORDERS: "orders",
      ORDER_ITEMS: "order_items"
    }
  };

  let client = null;

  function validateConfig() {
    if (!CONFIG.URL || !CONFIG.ANON_KEY) {
      throw new Error(
        "آدرس پروژه و کلید عمومی Supabase هنوز تنظیم نشده‌اند."
      );
    }

    if (
      !CONFIG.URL.startsWith("https://") ||
      !CONFIG.URL.includes(".supabase.co")
    ) {
      throw new Error("آدرس Supabase معتبر نیست.");
    }
  }

  function getClient() {
    if (client) return client;

    validateConfig();

    if (!window.supabase?.createClient) {
      throw new Error(
        "کتابخانه Supabase بارگذاری نشده است."
      );
    }

    client = window.supabase.createClient(
      CONFIG.URL,
      CONFIG.ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    return client;
  }

  function getPublicImageUrl(path) {
    if (!path) return "";

    if (
      path.startsWith("https://") ||
      path.startsWith("http://")
    ) {
      return path;
    }

    const db = getClient();

    const { data } = db.storage
      .from(CONFIG.STORAGE_BUCKET)
      .getPublicUrl(path);

    return data.publicUrl || "";
  }

  async function uploadProductImage(file, userId) {
    if (!file) {
      throw new Error("تصویری انتخاب نشده است.");
    }

    if (!userId) {
      throw new Error("کاربر وارد حساب نشده است.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("فقط فایل تصویری قابل آپلود است.");
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      throw new Error(
        "حجم تصویر نباید بیشتر از ۵ مگابایت باشد."
      );
    }

    const extension = (
      file.name.split(".").pop() || "jpg"
    ).toLowerCase().replace(/[^a-z0-9]/g, "");

    const safeExtension = extension || "jpg";

    const filePath =
      userId + "/" +
      crypto.randomUUID() + "." +
      safeExtension;

    const db = getClient();

    const { data, error } = await db.storage
      .from(CONFIG.STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;

    return {
      path: data.path,
      url: getPublicImageUrl(data.path)
    };
  }

  async function deleteProductImage(path) {
    if (!path) return;

    const db = getClient();

    const { error } = await db.storage
      .from(CONFIG.STORAGE_BUCKET)
      .remove([path]);

    if (error) throw error;
  }

  window.ZENVIA_SUPABASE = {
    CONFIG,
    getClient,
    getPublicImageUrl,
    uploadProductImage,
    deleteProductImage
  };

})(window);
