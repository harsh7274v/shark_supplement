import { useEffect, useState } from "react";
import { API, scrollToSection } from "../lib/api";
import Header from "../components/Header";
import Hero from "../components/Hero";
import Marquee from "../components/Marquee";
import Categories from "../components/Categories";
import NewArrivals from "../components/NewArrivals";
import ShopSection from "../components/ShopSection";
import Footer from "../components/Footer";
import CartDrawer from "../components/CartDrawer";
import AuthModal from "../components/AuthModal";

export default function Home() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    API.get("/categories")
      .then((r) => setCategories(r.data))
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
        <ShopSection categories={categories} activeCategory={activeCategory} onNavCategory={onNavCategory} />
      </main>
      <Footer categories={categories} onNavCategory={onNavCategory} />
      <CartDrawer />
      <AuthModal />
    </div>
  );
}

