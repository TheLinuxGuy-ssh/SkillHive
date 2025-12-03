import { Tag } from "../components";

const Home = () => {
    return (
        <>
            <div className="content pt-20 px-5 w-full h-full flex font-display">
                <div className="content-left w-[20%]">
                    <div className="profile-card bg-[#292928] rounded-2xl overflow-hidden">
                        <div className="profilebanner w-full h-20">
                            <img src="/banner.jpg" alt="" />
                        </div>
                        <div className="profile-details p-4">
                            <div className="profile-highlights flex justify-center mb-5">
                                <div className="profile-followers w-[37.5%] flex flex-col justify-end items-center">
                                    <div className="high-number font-bold text-md">
                                        1342
                                    </div>
                                    <div className="high-title">
                                        Followers
                                    </div>
                                </div>
                                <div className="profile-photo w-[25%] h-21 rounded-2xl overflow-hidden border-1">
                                    <img className="w-full h-full" src="/tlg.png" alt="" />
                                </div>
                                <div className="profile-trust w-[37.55%] flex flex-col justify-end items-center">
                                    <div className="high-number font-bold text-md">
                                        453
                                    </div>
                                    <div className="high-title">
                                        Trust Factor
                                    </div>
                                </div>
                            </div>
                            <div className="profile-name text-center font-display-bold text-xl">
                                TheLinuxGuy
                            </div>
                            <div className="profile-username text-center text-gray-200">
                                @tlg
                            </div>
                            <div className="bio my-3 text-center">
                                Just a Server Administrator
                            </div>
                            <div className="profile-btn py-2 px-3 text-center bg-white/5 hover:bg-white/10 transition-ui font-semibold rounded-2xl cursor-pointer">
                                View My Profile
                            </div>
                        </div>
                    </div>
                    <div className="skill-tags mt-4 p-1 bg-[#292928] rounded-2xl">
                        <h2 className="p-3 text-xl font-display-bold">Skills</h2>
                        <div className="flex flex-wrap">
                            <Tag>
                                UI/UX   
                            </Tag>
                            <Tag>
                                Programming
                            </Tag>
                            <Tag>
                                Finance
                            </Tag>
                            <Tag>
                                Musical
                            </Tag>
                            <Tag>
                                Sports
                            </Tag>
                            <Tag>
                                Gaming
                            </Tag>
                            <Tag>
                                Languages
                            </Tag>
                            <Tag>
                                Other
                            </Tag>
                        </div>
                    </div>
                    <div className="communities mt-4 p-1 bg-[#292928] rounded-2xl">
                        <div className="communities-top flex items-center">
                        <h2 className="p-3 text-xl font-display-bold">Hives</h2>
                         <div className="search-community ml-auto">
                            <i className="fa-solid fa-search"></i>
                         </div>
                         <div className="add-community p-2">
                            <i className="fa-regular fa-plus text-2xl"></i>
                         </div>
                        </div>
                        <div className="community p-1 m-1 flex items-center">
                            <div className="community-img w-17 rounded-2xl border-3 border-white/8">
                                <img className="w-full h-full rounded-2xl" src="/tlg.png" alt="" />
                            </div>
                            <div className="community-details m-2 text-lg">
                                <div className="community-name font-display-bold">
                                    Programing Penguins
                                </div>
                                <div className="community-connections text-sm">
                                  <i className="fa-solid fa-circle text-[#fffd01]"></i>  34 friends already in Community
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="content-middle w-[60%]">
                        
                </div>
                <div className="content-right w-[20%]">
                    <div className="activity-card bg-[#292928] w-full h-full rounded-2xl p-1">
                        <h2 className="text-xl font-display-bold p-3">
                           Recent Activity 
                        </h2>
                        <div className="activity-card m-1 p-1">
                            <div className="activity-content flex ">
                                <div className="activity-img w-20 h-20 rounded-2xl overflow-hidden border-3 border-white/7">
                                    <img className="w-full h-full" src="/tlg.png" alt="" />
                                </div>
                                <div className="activity-details flex flex-col justify-center ml-2">
                                    <div className="activity-name text-lg font-display-bold">
                                        TheDesignGuy
                                    </div>
                                    <div className="activity text-xs">
                                        <span className="text-gray-400">Sent you Job Request</span><i className="fa-solid text-xs text-[#fffd01] fa-circle mx-2"></i><span className="text-[#fffd01]">3 mins ago</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default Home