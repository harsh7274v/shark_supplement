import { useEffect, useState } from "react";
import { API, scrollToSection } from "../lib/api";
import { DEFAULT_CATEGORIES } from "../data/defaultCatalog";
import Header from "../components/Header";
import Hero from "../components/Hero";
import Marquee from "../components/Marquee";
import Categories from "../components/Categories";
import NewArrivals from "../components/NewArrivals";
import SaleSection from "../components/SaleSection";
import ShopSection from "../components/ShopSection";
import Footer from "../components/Footer";
import CartDrawer from "../components/CartDrawer";
import AuthModal from "../components/AuthModal";

export default function Home() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  useEffect(() => {
    API.get("/categories")
      .then((r) => {
        if (Array.isArray(r.data) && r.data.length > 0) {
          setCategories(r.data);
        }
      })
      .catch(() => {});
  }, []);

  const onNavCategory = (slug) => {
    setActiveCategory(slug || "all");
    scrollToSection("shop");
  };

  return (
    <div id="top" className="min-h-screen bg-white">
      <Header onNavCategory={onNavCategory} />
      <main>
        <Hero />
        <Marquee />
        <Categories categories={categories} activeCategory={activeCategory} onNavCategory={onNavCategory} />
        <NewArrivals />
        <SaleSection />
        <ShopSection categories={categories} activeCategory={activeCategory} onNavCategory={onNavCategory} />
      </main>
      <Footer categories={categories} onNavCategory={onNavCategory} />
      <CartDrawer />
      <AuthModal />
    </div>
  );
}
