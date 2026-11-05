import React from "react";

function Footer() {
    return (
        <footer className="bg-sage-100 w-full border-t border-sage-200 mt-8">
            <div className="max-w-6xl mx-auto px-6 py-6 text-center text-forest-800 text-sm space-y-1">
                <p>
                    Created by the Knot AI team in the{' '}
                    <a href="https://sites.math.washington.edu/ai/">UW Math AI Lab</a>
                </p>
                <p className="text-moss-700">&copy; 2025 Math AI Lab. All rights reserved.</p>
            </div>
        </footer>
    );
}

export default Footer;
