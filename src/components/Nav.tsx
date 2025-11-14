import { NavLink } from 'react-router';

const Nav = () => {
    return (
        <div className="nav absolute top-0 left-0 w-full p-3 pt-5 flex">
                    <div className="nav-left w-[25%] flex justify-start items-center">
                        <div className="nav-brand text-2xl font-bold ml-2 mr-10 text-[#fffd01]">
                            <img  alt="" />
                            SkillHive
                        </div>
                        <div className="nav-skill-search-box">
                            <input type="text" placeholder='Explore...' className="search-box border-0 outline-0 bg-white/5 focus:bg-white/15 rounded-2xl px-3 py-2 transition-ui" />
                        </div>
                    </div>
                    <div className="nav-center w-[50%] flex justify-center">
                        <div className="nav-links flex items-center justify-center">
                            <NavLink viewTransition to="/home" className={`nav-link font-lg mx-3`}>
                                <i className="fa-regular fa-home text-white text-xl hover:text-[#fffd01] transition-ui"></i>
                            </NavLink>
                            <NavLink to="/learn" className="nav-link font-lg mx-3">
                                <i className="fa-solid fa-brain text-white text-xl hover:text-[#fffd01] transition-ui"></i>
                            </NavLink>
                            <NavLink to="/chat" className="nav-link font-lg mx-3">
                                <i className="fa-regular fa-comment-dots text-white text-xl hover:text-[#fffd01] transition-ui"></i>
                            </NavLink>
                            <a className="nav-link font-lg mx-3">
                                <i className="fa-regular fa-bell text-white text-xl hover:text-[#fffd01] transition-ui"></i>
                            </a>
                        </div>
                    </div>
                    <div className="nav-right w-[25%] flex justify-end items-center">
                        <div className="profile-btn bg-white/10 px-3 py-2 rounded-2xl">
                            TheLinuxGuy
                        </div>
                    </div>
                </div>
    )
}

export default Nav;