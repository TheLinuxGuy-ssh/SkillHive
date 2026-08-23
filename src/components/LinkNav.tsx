import { useAuth } from "@/hooks/useAuth";
import { useRef, useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router";

type Position = {
  width?: number;
  opacity?: number;
  left?: number;
  height?: number;
};

type CursorProps = {
  position: Position;
  className: string;
};

type TabProps = {
  to: string;
  icon: string;
  iconType: string;
  children: React.ReactNode;
  index: number;
  tabRefs: React.MutableRefObject<(HTMLAnchorElement | null)[]>;
  setPosition: React.Dispatch<React.SetStateAction<Position>>;
  position: Position;
};

export const LinkNav = () => {
  const location = useLocation();

  const [position, setPosition] = useState<Position>({
    left: 0,
    width: 0,
    opacity: 0,
    height: 0,
  });

  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const navParent = useRef<HTMLDivElement>(null);

  const moveToActive = () => {
    if (!navParent.current) return;

    const active = navParent.current.querySelector(
      "a.active",
    ) as HTMLElement | null;

    if (!active) return;

    setPosition({
      width: active.offsetWidth,
      height: active.offsetHeight,
      left: active.offsetLeft,
      opacity: 1,
    });
  };

  useEffect(() => {
    moveToActive();
  }, []);

  useEffect(() => {
    moveToActive();
  }, [location]);


  const isActiveByCursor = (el: HTMLElement) => {
    if (!position.width) return false;

    const pillCenter = (position.left ? position.left : 0) + position.width / 2;

    const elLeft = el.offsetLeft;
    const elRight = elLeft + el.offsetWidth;

    return pillCenter >= elLeft && pillCenter <= elRight;
  };

    const session = useAuth();

  return (
    <div
      ref={navParent}
      onMouseLeave={moveToActive}
      className="nav-links hover:scale-[1.05] flex items-center relative justify-center nav-block p-1.25 hover:scale-[1.025] transition-ui"
    >
      <Tab
        index={0}
        tabRefs={tabRefs}
        setPosition={setPosition}
        position={position}
        to={session ? `/home` : `/`}
        iconType="regular"
        icon="home"
        isActiveByCursor={isActiveByCursor}
      >
        Home
      </Tab>

      {/* <Tab
        index={1}
        tabRefs={tabRefs}
        setPosition={setPosition}
        position={position}
        to="/learn"
        iconType="solid"
        icon="brain"
        isActiveByCursor={isActiveByCursor}
      >
        Learn
      </Tab> */}
      {session && (
        <Tab
          index={1}
          tabRefs={tabRefs}
          setPosition={setPosition}
          position={position}
          to="/rooms"
          iconType="solid"
          icon="door-open"
          isActiveByCursor={isActiveByCursor}
        >
          Rooms
        </Tab>
      )}
      {session && (
        <Tab
          index={2}
          tabRefs={tabRefs}
          setPosition={setPosition}
          position={position}
          to="/feed"
          iconType="regular"
          icon="comment"
          isActiveByCursor={isActiveByCursor}
        >
          Feed
        </Tab>
      )}
      <Tab
        index={3}
        tabRefs={tabRefs}
        setPosition={setPosition}
        position={position}
        to="/profile"
        iconType="regular"
        icon="user"
        isActiveByCursor={isActiveByCursor}
      >
        Profile
      </Tab>
      {/* <Tab
        index={2}
        tabRefs={tabRefs}
        setPosition={setPosition}
        position={position}
        to="/chat"
        iconType="regular"
        icon="comment-dots"
        isActiveByCursor={isActiveByCursor}
      >
        Chat
      </Tab> */}

      <Cursor position={position} className="" />
    </div>
  );
};

export const Tab = ({
  to,
  icon,
  iconType,
  children,
  index,
  tabRefs,
  setPosition,
  // position,
  isActiveByCursor,
}: TabProps & {
  isActiveByCursor: (el: HTMLElement) => boolean;
}) => {
  return (
    <NavLink
      to={to}
      ref={(el) => {
        tabRefs.current[index] = el;
      }}
      onMouseEnter={() => {
        const el = tabRefs.current[index];
        if (!el) return;

        const rect = el.getBoundingClientRect();

        setPosition({
          width: rect.width,
          height: rect.height,
          left: el.offsetLeft,
          opacity: 1,
        });
      }}
      className={`nav-link group scale-[1] hover:scale-[1.075] lg:active:scale-[0.95] py-2 px-2 relative z-10 text-md rounded-2xl flex items-center transition-ui ${
        tabRefs.current[index] && isActiveByCursor(tabRefs.current[index]!)
          ? "text-black"
          : "text-black dark:text-white"
      }`}
      draggable="false"
    >
      <i className={`fa-${iconType} fa-${icon} text-xl mr-2`} />
      {children}
    </NavLink>
  );
};

export const Cursor = ({ position, className }: CursorProps) => {
  return (
    <li
      className={`absolute bg-[#fffd01] list-none rounded-2xl transition-all duration-200 z-0 ${className}`}
      style={{
        left: position.left,
        width: position.width,
        height: position.height,
        opacity: position.opacity,
      }}
    />
  );
};
