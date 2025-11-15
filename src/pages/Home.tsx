const Home = () => {
    return (
        <>                
                <div className="content pt-20 px-5 w-full h-full flex">
                    <div className="content-left w-[20%]">
                        <div className="profile-card bg-[#292928] rounded-2xl overflow-hidden">
                            <div className="profilebanner w-full h-20">
                                <img src="/src/assets/banner.jpg" alt="" />
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
                                        <img className="w-full h-full" src="/src/assets/tlg.png" alt="" />
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
                                <div className="profile-name text-center font-bold text-xl">
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
                            <h2 className="p-3 text-xl font-bold">Skills</h2>
                            <div className="flex flex-wrap">
                            <div className="tag">
                                UI/UX
                            </div>
                            <div className="tag">
                                Programming
                            </div>
                            <div className="tag">
                                Finance
                            </div>
                            <div className="tag">
                                Musical
                            </div>
                            <div className="tag">
                                Sports
                            </div>
                            <div className="tag">
                                Gaming
                            </div>
                            <div className="tag">
                                Languages
                            </div>
                            <div className="tag">
                                Other
                            </div>
                            </div>
                        </div>
                    </div>
                    <div className="content-middle w-[60%]">

                    </div>
                    <div className="content-right w-[20%]">

                    </div>
                </div>
        </>
    )
}

export default Home