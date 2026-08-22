import { Routes, Route, useLocation, useNavigate, useParams } from "react-router";
import { AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import "./Layout.css";
import * as Page from "./pages";
import * as Comp from "./components";
import Cursor from "./components/Cursor";
import { AuthGate } from "./components/AuthGate";
import { ProfileProvider } from "./hooks/profileContext";
import { supabase } from "./lib/supabase";
import Lenis from 'lenis'
import SEO from "./components/SEO";

const ROUTE_ORDER = ["/", "/learn", "/profile"];

function AnimatedRoutes() {
  const location = useLocation();
  const [prevIndex, setPrevIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const router = useNavigate();

  useEffect(() => {
    const currentIndex = ROUTE_ORDER.indexOf(location.pathname);
    if (currentIndex !== -1) {
      setDirection(currentIndex >= prevIndex ? 1 : -1);
      setPrevIndex(currentIndex);
    }
  }, [location.pathname, prevIndex]);

const lenis = new Lenis({
  autoRaf: true,
});

lenis.on('scroll', (e) => {
  console.log(e);
});

  return (
    <ProfileProvider>
      <AnimatePresence mode="wait" custom={direction}>
        <Routes location={location} key={location.pathname}>
          <Route
            path="/"
            element={
              <AuthGate require="guest">
                <SEO />
                <Page.Landing />
              </AuthGate>
            }
          />
          <Route
            path="/login"
            element={
              <AuthGate require="guest">
                <SEO />
                <Page.Sign />
              </AuthGate>
            }
          />
          <Route
            path="/register"
            element={
              <AuthGate require="guest">
                <SEO />
                <Page.Register />
              </AuthGate>
            }
          />
          <Route
            path="/home"
            element={
              <AuthGate require="auth">
                <SEO />
                <Page.Home />
              </AuthGate>
            }
          />
          <Route path="/learn" element={
            <AuthGate require="auth">
              <SEO />
              <Page.Learn />
            </AuthGate>
          } />
          <Route path="/feed" element={
            <AuthGate require="auth">
              <SEO />
              <Page.Feed />
            </AuthGate>
          } />
          <Route path="/rooms" element={
            <AuthGate require="auth">
              <SEO />
              <Page.Rooms />
            </AuthGate>
          } />
          <Route path="/review" element={
            <AuthGate require="auth">
              <SEO />
              <Page.Review />
            </AuthGate>
          } />
          <Route path="/profile" element={
            <AuthGate require="auth">
              <SEO />
              <Page.Profile />
            </AuthGate>
          } />
          <Route path="/profile/:id" element={
            <AuthGate require="auth">
              <PublicProfileWithSEO />
            </AuthGate>
          } />
          <Route path="/p/:username" element={
            <>
              <SEO />
              <Page.UserProfile />
            </>
          } />
          <Route path="/projects/:id" element={
            <>
              <SEO />
              <Page.Project />
            </>
          } />
          <Route path="/post/:postId" element={
            <AuthGate require="auth">
              <PostWithSEO />
            </AuthGate>
          } />
          <Route path="/notifications" element={
            <AuthGate require="auth">
              <SEO />
              <Page.Notifications />
            </AuthGate>
          } />
          <Route
            path="/rooms/:roomName"
            element={
              <AuthGate require="auth">
                <SEO />
                <Page.Room supabase={supabase} onLeave={() => router("/")} />
              </AuthGate>
            }
          />
          <Route
            path="/settings/profile"
            element={
              <AuthGate require="auth">
                <SEO />
                <Page.SettingsProfile />
              </AuthGate>
            }
          />
          <Route path="*" element={<Page.NotFound />} />
        </Routes>
      </AnimatePresence>
    </ProfileProvider>
  );
}

export default function App() {
  return (
    <>
      <Cursor />
      <Comp.Nav />
      <AnimatedRoutes />
    </>
  );
}

function PublicProfileWithSEO() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <SEO dynamicParams={{ id: params.id ?? "" }} />
      <Page.PublicProfile />
    </>
  );
}

function PostWithSEO() {
  const params = useParams<{ postId: string }>();
  return (
    <>
      <SEO dynamicParams={{ id: params.postId ?? "" }} />
      <Page.Post />
    </>
  );
}
